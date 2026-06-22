import "server-only";
import {
  sb,
  getTrainerContext,
  weekdayKo,
  hourLabel,
  todayISO,
  dayDiff,
  nowKstParts,
} from "@/lib/data/db";
import type {
  AvatarTone,
  BadgeView,
  Me,
  MemberDetailView,
  MembershipProduct,
  StaffMember,
  TeamAvatar,
} from "@/lib/types";

export interface PaymentSummary {
  membershipId: string | null;
  memberId: string | null;
  memberName: string;
  productLabel: string; // "20회권"
  amount: number | null;
  payDateLabel: string; // "06.22"
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
    .select("id, display_name, role, status")
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
    const role: StaffMember["role"] = s.status === "invited" ? "invited" : s.role;
    const sub =
      role === "owner"
        ? `대표 · 나 · 담당 ${count}명`
        : role === "instructor"
          ? `강사 · 담당 ${count}명`
          : "초대 대기 · 계정 미설정";
    return {
      id: s.id,
      name: s.display_name,
      initial: initialOf(s.display_name),
      avatarTone: TONE_FALLBACK,
      role,
      sub,
      isMe,
    };
  });
}

/* ------------------------- membership products ------------------------ */
/** Static catalogue (matches mock values). */
export function getMembershipProducts(): MembershipProduct[] {
  return [
    { product: "10", label: "10회권", price: 750000, recommended: false },
    { product: "20", label: "20회권", price: 1400000, recommended: true },
    { product: "30", label: "30회권", price: 1980000, recommended: false },
  ];
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
    .select("id, name, avatar_tone, status, injury_note")
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
      .select("id, type, weekday, hour")
      .in("id", schedIds)
      .eq("active", true)
      .order("weekday", { ascending: true });
    const list = scheds ?? [];
    if (list.length) {
      isTeam = list.some((s) => s.type === "2on1");
      const days = list.map((s) => weekdayKo(s.weekday)).join("·");
      const hr = hourLabel(list[0].hour).replace(":00", "시"); // "오후 6:00" → "오후 6시"
      scheduleLabel = `매주 ${days} ${hr}`;
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

  return {
    membershipId: ms?.id ?? null,
    memberId,
    memberName: member?.name ?? "",
    productLabel: ms?.product ? `${ms.product}회권` : "",
    amount: ms?.price ?? null,
    payDateLabel,
  };
}
