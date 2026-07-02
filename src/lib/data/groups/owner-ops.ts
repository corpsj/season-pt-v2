import "server-only";
import {
  sb,
  getTrainerContext,
  weekdayKo,
  hmLabel,
  todayISO,
  dayDiff,
  nowKstParts,
  monthBoundsKst,
  weekBoundsKst,
  currentMonthLabel,
  kstWeekday,
  kstDateISO,
} from "@/lib/data/db";
import type {
  AvatarTone,
  BadgeView,
  ExerciseItem,
  Me,
  MemberDetailView,
  MembershipProduct,
  PerfBar,
  StaffMember,
  StudioOps,
  StudioOverview,
  StudioSettings,
  TeamAvatar,
  TrainerRole,
} from "@/lib/types";
import { outstanding, paidInFull } from "@/lib/data/balance";
import { getRetention } from "./perf-retention";

export interface PaymentSummary {
  membershipId: string | null;
  memberId: string | null;
  memberName: string;
  productLabel: string; // "20회권"
  amount: number | null;
  payDateLabel: string; // "06.22"
  price: number | null;       // 회원권 정가 (null = 회원권 없음)
  paid: number;               // 기존 누적 결제액
  outstanding: number | null; // null = 회원권 없음, 0+ = 미수금
}

const TONE_FALLBACK: AvatarTone = "sage";
function toTone(v: string | null | undefined): AvatarTone {
  const allowed: AvatarTone[] = ["sage", "sageMid", "sageSoft", "gold", "pending", "terracotta"];
  return v && (allowed as string[]).includes(v) ? (v as AvatarTone) : TONE_FALLBACK;
}
function initialOf(name: string): string {
  return name?.trim().charAt(0) || "?";
}

/* -------------------------------- me -------------------------------- */
export async function getMe(): Promise<Me> {
  const t = await getTrainerContext();
  if (!t) {
    return { role: "trainer", name: "", roleLabel: "트레이너", isOwner: false };
  }
  const isOwner = t.role === "owner";
  return {
    role: isOwner ? "owner" : "trainer",
    name: t.displayName,
    roleLabel: isOwner ? "대표" : "트레이너",
    trainerRole: t.role,
    isOwner,
    trainerId: t.id,
  };
}

/* ------------------------------- staff ------------------------------ */
/** All trainers; mark isMe by matching context id; sub mirrors the mock copy. */
export async function getStaff(): Promise<StaffMember[]> {
  const t = await getTrainerContext();
  const { data: trainers } = await sb
    .from("trainers")
    .select("id, display_name, role, status, auth_user_id")
    .order("created_at", { ascending: true });

  const rows = trainers ?? [];

  // 담당 회원 수 집계 (member_trainers).
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: links } = await sb
      .from("member_trainers")
      .select("trainer_id")
      .in("trainer_id", ids);
    for (const l of links ?? []) {
      counts.set(l.trainer_id, (counts.get(l.trainer_id) ?? 0) + 1);
    }
  }

  return rows.map((s): StaffMember => {
    const isMe = !!t && s.id === t.id;
    const count = counts.get(s.id) ?? 0;
    const hasLogin = !!s.auth_user_id;
    const role: StaffMember["role"] = s.status === "invited" ? "invited" : s.role;
    const sub =
      role === "owner"
        ? `대표 · 나 · 담당 ${count}명`
        : role === "instructor"
          ? `강사 · 담당 ${count}명`
          : hasLogin
            ? `초대 대기 · 첫 로그인 전 · 담당 ${count}명`
            : `로그인 미발급 · 담당 ${count}명`;
    return {
      id: s.id,
      name: s.display_name,
      initial: initialOf(s.display_name),
      avatarTone: TONE_FALLBACK,
      role,
      sub,
      isMe,
      hasLogin,
    };
  });
}

export interface StaffMemberDetail {
  id: string;
  name: string;
  username: string;
  phone: string;
  role: TrainerRole;
  status: "active" | "invited" | "inactive";
  memberCount: number;
  isMe: boolean;
  isOwner: boolean;
  hasLogin: boolean; // 로그인 계정 발급 여부(false = 명단만 등록된 강사)
  rate1on1: number; // 회당 단가(정산 기준) — 강사 관리에서 수정
  rate2on1: number;
}

/** Single staff member for the 강사 상세/관리 screen. */
export async function getStaffMember(id: string): Promise<StaffMemberDetail | null> {
  const me = await getTrainerContext();
  const { data } = await sb
    .from("trainers")
    .select("id, display_name, username, phone, role, status, auth_user_id, rate_1on1, rate_2on1")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { count } = await sb
    .from("member_trainers")
    .select("member_id", { count: "exact", head: true })
    .eq("trainer_id", id);
  return {
    id: data.id,
    name: data.display_name,
    username: data.username,
    phone: data.phone ?? "",
    role: data.role,
    status: data.status,
    memberCount: count ?? 0,
    isMe: !!me && me.id === data.id,
    isOwner: data.role === "owner",
    hasLogin: !!data.auth_user_id,
    rate1on1: (data.rate_1on1 as number | null) ?? 0,
    rate2on1: (data.rate_2on1 as number | null) ?? 0,
  };
}

/* ------------------------------ revenue ------------------------------ */
export interface RevenueEntry {
  id: string;
  date: string; // YYYY-MM-DD
  dateLabel: string; // MM.DD
  amount: number;
  methodLabel: string;
  label: string; // 회원명·상품 or note
  membershipId: string | null; // 환불 취소(undoRefund) 대상 식별용
}
export interface RevenueMonth {
  key: string; // YYYY-MM
  label: string; // "2026년 6월"
  total: number;
  count: number;
  items: RevenueEntry[];
}
export interface RevenueView {
  totalAmount: number;
  totalCount: number;
  months: RevenueMonth[];
}

const METHOD_LABEL: Record<string, string> = { card: "카드", cash: "현금", account: "계좌이체" };

/** 매출 장부: 모든 결제(회원권 + 수동/과거)를 월별로 묶어 합계. 대표 전용. */
export async function getRevenue(): Promise<RevenueView> {
  // PostgREST 기본 1,000행 캡 — 무제한 단건 조회는 결제가 쌓이면 누적매출·CSV가 조용히 잘린다(감사 #6).
  // 1,000행씩 끝까지 페이지네이션.
  type PayRow = {
    id: string; amount: number | null; method: string; paid_at: string;
    membership_id: string | null; note: string | null;
  };
  const rows: PayRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: pays } = await sb
      .from("payments")
      .select("id, amount, method, paid_at, membership_id, note")
      .order("paid_at", { ascending: false })
      .order("id", { ascending: false }) // paid_at 동률 시 페이지 경계 중복/누락 방지용 2차 정렬
      .range(from, from + PAGE - 1);
    const chunk = (pays ?? []) as PayRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const msIds = [...new Set(rows.map((r) => r.membership_id).filter((x): x is string => !!x))];
  const labelByMs = new Map<string, string>();
  if (msIds.length) {
    const { data: ms } = await sb.from("memberships").select("id, product, member_id").in("id", msIds);
    const memberIds = [...new Set((ms ?? []).map((m) => m.member_id))];
    const nameById = new Map<string, string>();
    if (memberIds.length) {
      const { data: mem } = await sb.from("members").select("id, name").in("id", memberIds);
      for (const m of mem ?? []) nameById.set(m.id, m.name);
    }
    for (const m of ms ?? []) labelByMs.set(m.id, `${nameById.get(m.member_id) ?? "회원"} · ${m.product}회권`);
  }

  const byMonth = new Map<string, RevenueMonth>();
  let totalAmount = 0;
  for (const r of rows) {
    const amount = r.amount ?? 0;
    totalAmount += amount;
    const key = r.paid_at.slice(0, 7);
    let m = byMonth.get(key);
    if (!m) {
      m = { key, label: `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`, total: 0, count: 0, items: [] };
      byMonth.set(key, m);
    }
    const isSale = amount > 0 && r.membership_id != null; // 건수는 실제 판매만(환불 음수·수동 매출 제외)
    m.total += amount;
    m.count += isSale ? 1 : 0;
    m.items.push({
      id: r.id,
      date: r.paid_at,
      dateLabel: `${r.paid_at.slice(5, 7)}.${r.paid_at.slice(8, 10)}`,
      amount,
      methodLabel: METHOD_LABEL[r.method] ?? "기타",
      membershipId: r.membership_id,
      label:
        amount < 0
          ? r.membership_id
            ? `환불 · ${labelByMs.get(r.membership_id) ?? "회원권"}`
            : r.note || "환불"
          : r.membership_id
            ? labelByMs.get(r.membership_id) ?? "회원권"
            : r.note || "기타 매출",
    });
  }
  const months = [...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key));
  return { totalAmount, totalCount: rows.filter((r) => (r.amount ?? 0) > 0 && r.membership_id != null).length, months };
}

/** 배정 가능한 강사(비활성 제외) — 한꺼번에 입력 담당강사 드롭다운용. */
export async function getAssignableTrainers(): Promise<{ id: string; name: string }[]> {
  const { data } = await sb
    .from("trainers")
    .select("id, display_name")
    .neq("status", "inactive")
    .order("created_at", { ascending: true });
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.display_name as string }));
}

/* ------------------------- membership products ------------------------ */
/** Active products only, ordered by sort_order. */
export async function getMembershipProducts(): Promise<MembershipProduct[]> {
  const { data } = await sb
    .from("membership_products")
    .select("id, name, sessions, price, unit_list_price, duration_days, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sessions: r.sessions,
    price: r.price,
    unitListPrice: r.unit_list_price ?? 0,
    durationDays: r.duration_days,
    active: r.active,
    sortOrder: r.sort_order,
  }));
}

/** All products including inactive. */
export async function getAllProducts(): Promise<MembershipProduct[]> {
  const { data } = await sb
    .from("membership_products")
    .select("id, name, sessions, price, unit_list_price, duration_days, active, sort_order")
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    sessions: r.sessions,
    price: r.price,
    unitListPrice: r.unit_list_price ?? 0,
    durationDays: r.duration_days,
    active: r.active,
    sortOrder: r.sort_order,
  }));
}

const DEFAULT_SETTINGS: StudioSettings = {
  noshowDeducts: true,
  cancelCutoffHours: 0,
  notifExpiry: true,
  notifSession: true,
  notifPayment: true,
};

/** Studio-wide policy settings. Falls back to defaults if no row exists. */
export async function getStudioSettings(): Promise<StudioSettings> {
  const { data } = await sb
    .from("studio_settings")
    .select("noshow_deducts, cancel_cutoff_hours, notif_expiry, notif_session, notif_payment")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    noshowDeducts: data.noshow_deducts,
    cancelCutoffHours: data.cancel_cutoff_hours,
    notifExpiry: data.notif_expiry,
    notifSession: data.notif_session,
    notifPayment: data.notif_payment,
  };
}

/** Active exercises only, ordered by sort_order. */
export async function getExercises(): Promise<{ id: string; name: string; category: string | null }[]> {
  const { data } = await sb
    .from("exercises")
    .select("id, name, category")
    .eq("active", true)
    .order("category", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, category: r.category ?? null }));
}

/** All exercises including inactive. */
export async function getAllExercises(): Promise<ExerciseItem[]> {
  const { data } = await sb
    .from("exercises")
    .select("id, name, category, active, sort_order")
    .order("category", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category ?? null,
    active: r.active,
    sortOrder: r.sort_order,
  }));
}

/* --------------------------- member detail --------------------------- */
function badgeForMember(status: string, endDate: string | null): BadgeView {
  if (endDate) {
    const dDay = dayDiff(todayISO(), endDate);
    if (dDay <= 14 && dDay >= 0) {
      return { text: `D-${dDay}`, variant: dDay <= 5 ? "expiringNear" : "expiringSoon" };
    }
  }
  if (status === "rest") return { text: "휴면", variant: "active" };
  return { text: "활성", variant: "active" };
}

/** Membership 발급 화면 chip용 회원 상세. MemberDetailView 계약을 그대로 채운다. */
export async function getMemberDetail(id: string): Promise<MemberDetailView> {
  const { data: member } = await sb
    .from("members")
    .select("id, name, phone, gender, avatar_tone, status, injury_note")
    .eq("id", id)
    .maybeSingle();

  const name = member?.name ?? "";
  const avatarTone = toTone(member?.avatar_tone);
  const initial = initialOf(name);

  // 활성 회원권 (있으면).
  const { data: ms } = await sb
    .from("memberships")
    .select("product, total_sessions, remaining_sessions, start_date, end_date")
    .eq("member_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 정기 수업 (회원이 속한 스케줄).
  let isTeam = false;
  let team: TeamAvatar | undefined;
  let scheduleLabel = "";
  const { data: schedLinks } = await sb
    .from("schedule_members")
    .select("schedule_id")
    .eq("member_id", id);
  const schedIds = (schedLinks ?? []).map((s) => s.schedule_id);
  if (schedIds.length) {
    const { data: scheds } = await sb
      .from("schedules")
      .select("id, type, weekday, hour, minute")
      .in("id", schedIds)
      .eq("active", true)
      .order("weekday", { ascending: true });
    const list = scheds ?? [];
    if (list.length) {
      isTeam = list.some((s) => s.type === "2on1");
      const allSame = list.every((s) => s.hour === list[0].hour && s.minute === list[0].minute);
      scheduleLabel = allSame
        ? `매주 ${list.map((s) => weekdayKo(s.weekday)).join("·")} ${hmLabel(list[0].hour, list[0].minute)}`
        : "매주 " + list.map((s) => `${weekdayKo(s.weekday)} ${hmLabel(s.hour, s.minute)}`).join(" · ");
      // 팀(2:1) 아바타 구성
      if (isTeam) {
        const teamSched = list.find((s) => s.type === "2on1");
        if (teamSched) {
          const { data: tm } = await sb
            .from("schedule_members")
            .select("members(name, avatar_tone)")
            .eq("schedule_id", teamSched.id);
          const ppl = (tm ?? [])
            .map((r) => r.members as unknown as { name: string; avatar_tone: string } | null)
            .filter((p): p is { name: string; avatar_tone: string } => !!p);
          if (ppl.length >= 2) {
            team = {
              init1: initialOf(ppl[0].name),
              tone1: toTone(ppl[0].avatar_tone),
              init2: initialOf(ppl[1].name),
              tone2: toTone(ppl[1].avatar_tone),
            };
          }
        }
      }
    }
  }

  const remaining = ms?.remaining_sessions ?? 0;
  const total = ms?.total_sessions ?? 0;
  const startDate = ms?.start_date ?? "";
  const endDate = ms?.end_date ?? "";
  const dDay = endDate ? dayDiff(todayISO(), endDate) : 0;
  const barPct = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const productLabel = ms?.product ? `${isTeam ? "2:1" : "1:1"} PT ${ms.product}회권` : "";

  // 최신 체성분.
  const { data: bc } = await sb
    .from("body_compositions")
    .select("weight, skeletal_muscle, body_fat")
    .eq("member_id", id)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id,
    name,
    phone: (member as { phone?: string } | null)?.phone ?? "",
    gender: (member as { gender?: "female" | "male" | null } | null)?.gender ?? null,
    isTeam,
    team,
    initial,
    avatarTone,
    badge: badgeForMember(member?.status ?? "active", endDate || null),
    typeLabel: isTeam ? "2:1 PT" : "1:1 PT",
    product: productLabel,
    remaining,
    total,
    dDay,
    startDate,
    endDate,
    barPct,
    body: {
      weight: Number(bc?.weight ?? 0),
      skeletalMuscle: Number(bc?.skeletal_muscle ?? 0),
      bodyFat: Number(bc?.body_fat ?? 0),
    },
    schedule: scheduleLabel,
    injury: member?.injury_note ?? undefined,
    activeMembershipId: null,
    membershipPaused: false,
    events: [],
  };
}

/* --------------------------- payment summary --------------------------- */
/** 결제 기록 화면 요약: 회원의 최신 활성 회원권. */
export async function getPaymentSummary(memberId?: string): Promise<PaymentSummary> {
  const now = nowKstParts();
  const payDateLabel = `${String(now.getUTCMonth() + 1).padStart(2, "0")}.${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;

  if (!memberId) {
    return {
      membershipId: null,
      memberId: null,
      memberName: "",
      productLabel: "",
      amount: null,
      payDateLabel,
      price: null,
      paid: 0,
      outstanding: null,
    };
  }

  const [{ data: member }, { data: ms }] = await Promise.all([
    sb.from("members").select("name").eq("id", memberId).maybeSingle(),
    sb
      .from("memberships")
      .select("id, product, price")
      .eq("member_id", memberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // 미수금 계산: 기존 결제 내역 포함 (getMembershipBalance 재사용)
  let price: number | null = ms?.price ?? null;
  let paid = 0;
  let outstanding: number | null = null;
  if (ms?.id) {
    const bal = await getMembershipBalance(ms.id);
    price = bal.price;
    paid = bal.paid;
    outstanding = bal.outstanding;
  }

  return {
    membershipId: ms?.id ?? null,
    memberId,
    memberName: member?.name ?? "",
    productLabel: ms?.product ? `${ms.product}회권` : "",
    amount: ms?.price ?? null,
    payDateLabel,
    price,
    paid,
    outstanding,
  };
}

/* ---------------------------- studio overview ---------------------------- */
/** 월~토 요일 막대. weekdays = sessions의 KST 요일 번호(0=일..6=토) 리스트. */
function buildWeeklyBars(weekdays: number[]): PerfBar[] {
  const order = [1, 2, 3, 4, 5, 6]; // 월..토
  const labels = ["월", "화", "수", "목", "금", "토"];
  const counts = order.map((wd) => weekdays.filter((w) => w === wd).length);
  const max = Math.max(...counts, 0);
  return order.map((_, i) => {
    const c = counts[i];
    const valuePx = Math.min(60, Math.max(8, c * 8));
    return { label: labels[i], valuePx, emphasized: max > 0 && c === max };
  });
}

/** 대표 전용 운영 현황: 스튜디오 전체(무필터) 집계. ₩ 미포함. */
export async function getStudioOverview(): Promise<StudioOverview> {
  const monthLabel = currentMonthLabel();
  const t = await getTrainerContext();
  if (!t) {
    return {
      monthLabel,
      activeMembers: 0,
      newThisMonth: 0,
      weekClasses: 0,
      attendRate: 100,
      trainerCount: 0,
      weeklyBars: buildWeeklyBars([]),
      expiringCount: 0,
    };
  }

  const { startISO: monStart, endISO: monEnd } = monthBoundsKst();
  const { startISO: wkStart, endISO: wkEnd } = weekBoundsKst();
  const today = todayISO();

  // 활성 회원권(전체) — 활동 회원 수 + 만료 임박 둘 다에 재사용.
  const { data: activeMs } = await sb
    .from("memberships")
    .select("member_id, end_date")
    .eq("status", "active");
  const activeRows = activeMs ?? [];
  const activeMembers = new Set(activeRows.map((m) => m.member_id)).size;
  const expiringCount = activeRows.filter((m) => {
    const d = dayDiff(today, m.end_date);
    return d >= 0 && d <= 14;
  }).length;

  // 이번 달 신규 회원(전체).
  const { count: newCount } = await sb
    .from("members")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monStart)
    .lt("created_at", monEnd);
  const newThisMonth = newCount ?? 0;

  // 이번 주(월~토) 수업(전체) — 개수 + 요일 분포.
  const { data: weekSess } = await sb
    .from("sessions")
    .select("scheduled_at")
    .gte("scheduled_at", wkStart)
    .lt("scheduled_at", wkEnd);
  const weekRows = weekSess ?? [];
  const weekClasses = weekRows.length;
  const weeklyBars = buildWeeklyBars(weekRows.map((s) => kstWeekday(s.scheduled_at)));

  // 이번 달 출석률(전체).
  const { data: monthSess } = await sb
    .from("sessions")
    .select("status")
    .gte("scheduled_at", monStart)
    .lt("scheduled_at", monEnd);
  const msRows = monthSess ?? [];
  const attended = msRows.filter((s) => s.status === "attended").length;
  const noshow = msRows.filter((s) => s.status === "noshow").length;
  const denom = attended + noshow;
  const attendRate = denom > 0 ? Math.round((attended / denom) * 100) : 100;

  // 활성 트레이너 수.
  const { count: tCount } = await sb
    .from("trainers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  const trainerCount = tCount ?? 0;

  return {
    monthLabel,
    activeMembers,
    newThisMonth,
    weekClasses,
    attendRate,
    trainerCount,
    weeklyBars,
    expiringCount,
  };
}

/**
 * 대표 전용 운영(사업) 현황. 스튜디오 전체.
 * 대표가 운영 탭을 여는 3가지 질문에 답한다: 이번 달 얼마 벌었나 / 들어올 돈은 / 막힌 일 있나.
 */
export async function getStudioOps(): Promise<StudioOps> {
  const monthLabel = currentMonthLabel();
  const t = await getTrainerContext();
  if (!t) {
    return {
      monthLabel,
      revenueThisMonth: 0,
      paymentCount: 0,
      revenueDeltaPct: null,
      newMembers: 0,
      expiringCount: 0,
      expectedRevenue: 0,
      pendingRequests: 0,
      activeMembers: 0,
    };
  }

  // 결제(매출): payments.paid_at은 date 컬럼 → KST 월 1일 날짜 문자열로 경계 비교.
  const k = nowKstParts();
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth(); // 0-based
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstThis = `${y}-${pad(m + 1)}-01`;
  const firstNext = m === 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`;
  const pm = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  const firstPrev = `${pm.y}-${pad(pm.m + 1)}-01`;

  const [{ data: payThis }, { data: payPrev }] = await Promise.all([
    sb.from("payments").select("amount").gte("paid_at", firstThis).lt("paid_at", firstNext),
    sb.from("payments").select("amount").gte("paid_at", firstPrev).lt("paid_at", firstThis),
  ]);
  const sumAmount = (rows: { amount: number | null }[] | null) =>
    (rows ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  const revenueThisMonth = sumAmount(payThis);
  const paymentCount = (payThis ?? []).length;
  const revenuePrev = sumAmount(payPrev);
  const revenueDeltaPct =
    revenuePrev > 0
      ? Math.round(((revenueThisMonth - revenuePrev) / revenuePrev) * 100)
      : null;

  // 신규 회원 / 재등록 / 처리 대기 / 활성 회원 — 서로 독립이라 동시 실행.
  const { startISO, endISO } = monthBoundsKst();
  const [{ count: nm }, ret, { count: pend }, { data: activeMs }] = await Promise.all([
    sb
      .from("members")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    getRetention(), // owner 전체 범위 — 재등록 임박 + 예상 매출
    sb
      .from("schedule_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("requester_type", "member"),
    sb.from("memberships").select("member_id").eq("status", "active"),
  ]);
  const newMembers = nm ?? 0;
  const pendingRequests = pend ?? 0;
  const activeMembers = new Set((activeMs ?? []).map((r) => r.member_id)).size;

  return {
    monthLabel,
    revenueThisMonth,
    paymentCount,
    revenueDeltaPct,
    newMembers,
    expiringCount: ret.expiringCount,
    expectedRevenue: ret.expectedRevenue,
    pendingRequests,
    activeMembers,
  };
}

export async function getMembershipBalance(membershipId: string) {
  const { data: ms } = await sb.from("memberships").select("price").eq("id", membershipId).maybeSingle();
  const { data: pays } = await sb.from("payments").select("amount").eq("membership_id", membershipId);
  const amounts = (pays ?? []).map((p) => (p.amount as number | null) ?? 0);
  const price = (ms?.price as number | null) ?? null;
  return { price, paid: amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0), outstanding: outstanding(price, amounts), paidInFull: paidInFull(price, amounts) };
}

export interface OutstandingView {
  total: number;
  count: number;
  items: { memberId: string; name: string; product: string; outstanding: number }[];
}

export interface OwnerNotice { id: string; tag: string; tone: string; title: string; body: string; dateLabel: string }

/** 대표용 공지 목록(작성/삭제 화면). */
export async function getStudioNotices(): Promise<OwnerNotice[]> {
  const { data } = await sb
    .from("notices")
    .select("id, tag, tone, title, body, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map((n) => ({
    id: n.id as string,
    tag: n.tag as string,
    tone: n.tone as string,
    title: n.title as string,
    body: (n.body as string | null) ?? "",
    dateLabel: kstDateISO(n.created_at as string).slice(5).replace("-", "."),
  }));
}

/** 미수금(받을 돈) 집계: 결제액 < 정가인 건. 대표 핵심 지표(누가 얼마 밀렸나).
 *  만료(감사 H16)·일시정지(감사 #9)로 flip되는 순간 밀린 잔금이 목록에서 사라지지 않게
 *  refunded만 제외하고 전부 포함. */
export async function getOutstanding(): Promise<OutstandingView> {
  const { data: msRows } = await sb
    .from("memberships")
    .select("id, member_id, product, price, members(name)")
    .in("status", ["active", "expired", "paused"]);
  const ms = (msRows ?? []) as unknown as { id: string; member_id: string; product: string; price: number | null; members: { name: string } | null }[];
  if (!ms.length) return { total: 0, count: 0, items: [] };

  const { data: payRows } = await sb.from("payments").select("membership_id, amount").in("membership_id", ms.map((m) => m.id));
  const paidByMs = new Map<string, number[]>();
  for (const p of (payRows ?? []) as { membership_id: string; amount: number | null }[]) {
    const arr = paidByMs.get(p.membership_id) ?? [];
    if (p.amount != null) arr.push(p.amount);
    paidByMs.set(p.membership_id, arr);
  }

  const items = ms
    .map((m) => ({
      memberId: m.member_id,
      name: m.members?.name ?? "",
      product: `${m.product}회권`,
      outstanding: outstanding(m.price, paidByMs.get(m.id) ?? []),
    }))
    .filter((x) => x.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  return { total: items.reduce((s, x) => s + x.outstanding, 0), count: items.length, items };
}

/* --------------------------- 회원 정기 일정 편집 --------------------------- */

export type MemberScheduleSlot = {
  scheduleId: string;
  weekday: number; // 0=일 … 6=토
  hour: number;
  minute: number;
  type: "1on1" | "2on1";
  editable: boolean; // 1:1 솔로만 편집 가능 — 2:1 팀은 파트너에게 영향이라 읽기전용
  partnerName?: string;
};
export type MemberScheduleView = { trainerId: string | null; slots: MemberScheduleSlot[] };

/** 회원의 활성 정기 스케줄을 편집용 슬롯 목록으로. 담당 강사(스케줄 소유자)도 함께 반환. */
export async function getMemberSchedule(memberId: string): Promise<MemberScheduleView> {
  const { data: mt } = await sb.from("member_trainers").select("trainer_id").eq("member_id", memberId).maybeSingle();
  const trainerId = (mt?.trainer_id as string | null) ?? null;

  const { data: links } = await sb.from("schedule_members").select("schedule_id").eq("member_id", memberId);
  const ids = (links ?? []).map((l) => l.schedule_id as string);
  if (ids.length === 0) return { trainerId, slots: [] };

  const { data: rows } = await sb
    .from("schedules")
    .select("id, type, weekday, hour, minute, schedule_members(member_id, members(name))")
    .in("id", ids)
    .eq("active", true);

  const slots: MemberScheduleSlot[] = ((rows ?? []) as unknown as {
    id: string; type: "1on1" | "2on1"; weekday: number; hour: number; minute: number | null;
    schedule_members: { member_id: string; members: { name: string } | null }[];
  }[])
    .map((s) => {
      const members = s.schedule_members ?? [];
      const partner = members.find((m) => m.member_id !== memberId)?.members?.name;
      const isTeam = s.type === "2on1" || members.length > 1;
      return {
        scheduleId: s.id,
        weekday: s.weekday,
        hour: s.hour,
        minute: s.minute ?? 0,
        type: s.type,
        editable: !isTeam,
        partnerName: isTeam ? partner ?? undefined : undefined,
      };
    })
    .sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.minute - b.minute);

  return { trainerId, slots };
}
