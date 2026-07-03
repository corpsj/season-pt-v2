import "server-only";
import {
  sb,
  getTrainerContext,
  kstDateISO,
  hmLabel,
  clockHM,
  todayISO,
  dayDiff,
  monthBoundsKst,
  weekBoundsKst,
  currentMonthLabel,
} from "@/lib/data/db";
import { isExpiringWindow } from "@/lib/data/notify";
import type {
  AvatarTone,
  BadgeView,
  CalendarDay,
  Me,
  MemberDetailView,
  MemberFilter,
  MembersView,
  MemberListItem,
  TeamAvatar,
  TrainerCalendarData,
  TrainerDayClass,
  TrainerWeekDay,
} from "@/lib/types";

/* ---------------------------------------------------------------- shared */

const WD = ["일", "월", "화", "수", "목", "금", "토"];

const BAR = {
  "1on1": "#768c6a",
  "2on1": "#6e8aa0",
  attended: "#8fa187",
  cancelled: "#c2baad",
} as const;

function initialOf(name: string): string {
  return name.slice(0, 1);
}

function asTone(t: string | null | undefined): AvatarTone {
  return (t ?? "sage") as AvatarTone;
}

/** Resolve the logged-in trainer Me, scoping all queries to t.id. */
export async function getMe(): Promise<Me> {
  const t = await getTrainerContext();
  if (!t) {
    // Not authenticated — return a neutral owner-less shell (screens guard via middleware).
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

/** Unread message count across this trainer's chat threads (for TabBar badge). */
export async function getChatUnread(): Promise<number> {
  const t = await getTrainerContext();
  if (!t) return 0;
  const { data: threads } = await sb.from("chat_threads").select("id").eq("trainer_id", t.id);
  const threadIds = (threads ?? []).map((r) => (r as { id: string }).id);
  if (threadIds.length === 0) return 0;
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds)
    .eq("sender_type", "member")
    .eq("read_by_trainer", false);
  return count ?? 0;
}

/* ---------------------------------------------------------------- month grid */

function buildMonthGrid(year: number, month0: number, dots: Set<string>, selectedISO: string): CalendarDay[] {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, i) => {
    const n = i + 1;
    const iso = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    const wd = new Date(Date.UTC(year, month0, n)).getUTCDay();
    return {
      n,
      dateISO: iso,
      inMonth: true,
      isSunday: wd === 0,
      hasDot: dots.has(iso),
      selected: iso === selectedISO,
    } satisfies CalendarDay;
  });
}

function fullDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WD[wd]}요일`;
}
/* --------------------------- trainer calendar --------------------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
/** KST 자정(YYYY-MM-DD) → 실제 UTC instant ISO. */
const kstMidnightUtc = (dISO: string) => {
  const [y, m, d] = dISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -9)).toISOString();
};

/**
 * 트레이너 홈 캘린더 페이로드(월간/주간 공용): 헤더 카운트 + 기간 이동 앵커 + 날짜별 수업.
 * anchor(YYYY-MM-DD)가 속한 달/주(월요일 시작)를 조회한다. 날짜 전환은 클라이언트에서 즉시.
 */
export async function getTrainerCalendarData(
  view: "month" | "week",
  anchorISO?: string,
): Promise<TrainerCalendarData> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";
  const today = todayISO();
  const anchor = anchorISO && /^\d{4}-\d{2}-\d{2}$/.test(anchorISO) ? anchorISO : today;
  const [ay, am, ad] = anchor.split("-").map(Number);

  let startDate: string;
  let endExcl: string;
  let periodLabel: string;
  let prevD: string;
  let nextD: string;
  let firstWeekday = 0;
  let initialSelected = today;
  let weekDays: TrainerWeekDay[] = [];

  if (view === "week") {
    // 월요일 시작 7일 (수업 주간의 관례) — 월간 그리드는 기존대로 일요일 시작.
    const a = new Date(Date.UTC(ay, am - 1, ad));
    const start = new Date(a.getTime() - ((a.getUTCDay() + 6) % 7) * 86400000);
    const last = new Date(start.getTime() + 6 * 86400000);
    startDate = dateOf(start);
    endExcl = dateOf(new Date(start.getTime() + 7 * 86400000));
    prevD = dateOf(new Date(start.getTime() - 7 * 86400000));
    nextD = endExcl;
    const sm = start.getUTCMonth() + 1;
    const lm = last.getUTCMonth() + 1;
    periodLabel =
      sm === lm
        ? `${sm}월 ${start.getUTCDate()}일 — ${last.getUTCDate()}일`
        : `${sm}월 ${start.getUTCDate()}일 — ${lm}월 ${last.getUTCDate()}일`;
    weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = dateOf(d);
      const w = d.getUTCDay();
      return { dateISO: iso, day: d.getUTCDate(), wd: WD[w], isToday: iso === today, isSunday: w === 0, isSaturday: w === 6 };
    });
  } else {
    startDate = `${ay}-${pad2(am)}-01`;
    endExcl = dateOf(new Date(Date.UTC(ay, am, 1)));
    prevD = dateOf(new Date(Date.UTC(ay, am - 2, 1)));
    nextD = endExcl;
    periodLabel = `${ay}년 ${am}월`;
    firstWeekday = new Date(Date.UTC(ay, am - 1, 1)).getUTCDay();
    initialSelected = today >= startDate && today < endExcl ? today : startDate;
  }

  // 기간 세션(+회원) / 만료임박 / 인박스 — 독립 조회라 병렬.
  const [{ data: sessRows }, expiringCount, inboxCount] = await Promise.all([
    sb
      .from("sessions")
      .select("id, scheduled_at, type, status, session_members(member_id, members(name, avatar_tone))")
      .eq("trainer_id", trainerId)
      .gte("scheduled_at", kstMidnightUtc(startDate))
      .lt("scheduled_at", kstMidnightUtc(endExcl))
      .order("scheduled_at", { ascending: true }),
    countExpiring(trainerId, today),
    countInbox(trainerId),
  ]);

  type Row = {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: "scheduled" | "attended" | "noshow" | "cancelled";
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  // 멤버 없는 세션(일정 변경 시 원래 슬롯에 남긴 cancelled 표식 등)은 실제 수업이 아니라 렌더 제외.
  const sessions = ((sessRows ?? []) as unknown as Row[]).filter((s) => (s.session_members?.length ?? 0) > 0);

  // 주간 블록의 "진행/전체회" 라벨 — 기간에 등장하는 회원들의 현재 회원권 스냅샷.
  const memberIds = [...new Set(sessions.flatMap((s) => s.session_members.map((sm) => sm.member_id)))];
  const countByMember = await membershipCountLabels(memberIds);

  const classesByDate: Record<string, TrainerDayClass[]> = {};
  for (const s of sessions) {
    (classesByDate[kstDateISO(s.scheduled_at)] ??= []).push(mapDayClass(s, today, countByMember));
  }
  for (const k of Object.keys(classesByDate)) {
    classesByDate[k].sort((a, b) => a.startMin - b.startMin);
  }

  const calDays =
    view === "month" ? buildMonthGrid(ay, am - 1, new Set(Object.keys(classesByDate)), initialSelected) : [];

  return {
    meName: me.name,
    meRole: me.roleLabel,
    todayLabel: fullDateLabel(today),
    expiringCount,
    inboxCount,
    hasInbox: inboxCount > 0,
    view,
    periodLabel,
    prevD,
    nextD,
    todayISO: today,
    initialSelected,
    calDays,
    firstWeekday,
    weekDays,
    classesByDate,
  };
}

/** 회원별 "진행/전체회" 라벨 — 사용 가능(잔여>0, 만료 임박순) 회원권 우선, 없으면 최근 것. */
async function membershipCountLabels(memberIds: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (memberIds.length === 0) return labels;
  const { data } = await sb
    .from("memberships")
    .select("member_id, total_sessions, remaining_sessions, end_date, status")
    .in("member_id", memberIds)
    .in("status", ["active", "paused"]);
  type R = { member_id: string; total_sessions: number | null; remaining_sessions: number | null; end_date: string };
  const best = new Map<string, { total: number; remaining: number; end: string; usable: boolean }>();
  for (const r of (data ?? []) as R[]) {
    const cand = {
      total: r.total_sessions ?? 0,
      remaining: r.remaining_sessions ?? 0,
      end: r.end_date,
      usable: (r.remaining_sessions ?? 0) > 0,
    };
    const cur = best.get(r.member_id);
    const better = !cur || (cand.usable !== cur.usable ? cand.usable : cand.usable ? cand.end < cur.end : cand.end > cur.end);
    if (better) best.set(r.member_id, cand);
  }
  for (const [id, b] of best) labels.set(id, `${Math.max(0, b.total - b.remaining)}/${b.total}회`);
  return labels;
}

function mapDayClass(
  s: {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: "scheduled" | "attended" | "noshow" | "cancelled";
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  },
  today: string,
  countByMember?: Map<string, string>,
): TrainerDayClass {
  const isTeam = s.type === "2on1";
  const names = s.session_members.map((sm) => sm.members?.name ?? "").filter(Boolean);
  const name = names.join("·");
  const sessionISO = kstDateISO(s.scheduled_at);
  const isPastOrToday = dayDiff(sessionISO, today) >= 0;
  const showAttend = s.status === "scheduled" && isPastOrToday;
  let barColor: string;
  if (s.status === "attended") barColor = BAR.attended;
  else if (s.status === "cancelled" || s.status === "noshow") barColor = BAR.cancelled;
  else barColor = isTeam ? BAR["2on1"] : BAR["1on1"];
  let badge: BadgeView | undefined;
  if (s.status === "attended") badge = { text: "완료", variant: "done" };
  else if (s.status === "noshow") badge = { text: "노쇼", variant: "cancelled" };
  else if (s.status === "cancelled") badge = { text: "취소", variant: "cancelled" };
  else if (isTeam) badge = { text: "2:1", variant: "team" };
  else badge = { text: "예정", variant: "scheduled" };
  const href = `/t/class/${s.id}`; // 2:1도 상세(콘텐츠 허브)로 — 출석은 상세 안 인라인 버튼/푸터에서
  const k = new Date(new Date(s.scheduled_at).getTime() + 9 * 3600 * 1000);
  const startMin = k.getUTCHours() * 60 + k.getUTCMinutes();
  return {
    sessionId: s.id,
    time: clockHM(s.scheduled_at),
    startMin,
    name,
    sub: isTeam ? "2:1" : countByMember?.get(s.session_members[0]?.member_id ?? ""),
    type: s.type,
    status: s.status,
    barColor,
    showAttend,
    badge,
    href,
  };
}

/* ------------------------------ members ------------------------------ */

async function countExpiring(trainerId: string, today: string): Promise<number> {
  const ids = await memberIdsOf(trainerId);
  if (ids.length === 0) return 0;
  const { data } = await sb
    .from("memberships")
    .select("member_id, end_date, status")
    .in("member_id", ids)
    .eq("status", "active");
  const expiring = new Set<string>();
  for (const r of (data ?? []) as { member_id: string; end_date: string; status: string }[]) {
    if (isExpiringWindow(dayDiff(today, r.end_date))) expiring.add(r.member_id);
  }
  return expiring.size;
}

async function countInbox(trainerId: string): Promise<number> {
  const { count } = await sb
    .from("schedule_change_requests")
    .select("id, sessions!inner(trainer_id)", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("sessions.trainer_id", trainerId);
  return count ?? 0;
}

async function memberIdsOf(trainerId: string): Promise<string[]> {
  const { data } = await sb.from("member_trainers").select("member_id").eq("trainer_id", trainerId);
  return (data ?? []).map((r) => (r as { member_id: string }).member_id);
}

/** Build per-member schedule meta (type, team, weekdays, hour, schedule label) from schedules. */
async function scheduleMetaOf(trainerId: string | null, memberIds: string[]) {
  const meta = new Map<
    string,
    { type: "1on1" | "2on1"; weekdays: number[]; hour: number; minute: number; team?: TeamAvatar; partnerNames: string[]; partnerId?: string }
  >();
  if (memberIds.length === 0) return meta;

  // Owner views all members → no trainer filter (trainerId null); otherwise scope to the trainer.
  let sq = sb
    .from("schedules")
    .select("id, type, weekday, hour, minute, active, schedule_members(member_id, members(name, avatar_tone))")
    .eq("active", true);
  if (trainerId) sq = sq.eq("trainer_id", trainerId);
  const { data: schedRows } = await sq;

  type SR = {
    id: string;
    type: "1on1" | "2on1";
    weekday: number;
    hour: number;
    minute: number;
    schedule_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  const scheds = (schedRows ?? []) as unknown as SR[];

  // Index schedules by member once (O(S)) so the per-member loop is O(1) lookups, not O(M×S).
  const byMember = new Map<string, SR[]>();
  for (const s of scheds) {
    for (const sm of s.schedule_members) {
      const arr = byMember.get(sm.member_id);
      if (arr) arr.push(s);
      else byMember.set(sm.member_id, [s]);
    }
  }

  for (const mid of memberIds) {
    const mine = byMember.get(mid) ?? [];
    if (mine.length === 0) continue;
    const weekdays = Array.from(new Set(mine.map((s) => s.weekday))).sort((a, b) => a - b);
    const hour = mine[0].hour;
    const minute = mine[0].minute ?? 0;
    const isTeam = mine.some((s) => s.type === "2on1");
    let team: TeamAvatar | undefined;
    let partnerId: string | undefined;
    const partnerNames: string[] = [];
    if (isTeam) {
      const teamSched = mine.find((s) => s.type === "2on1")!;
      const ms = teamSched.schedule_members;
      const selfSm = ms.find((sm) => sm.member_id === mid);
      const otherSm = ms.find((sm) => sm.member_id !== mid);
      if (otherSm) {
        partnerNames.push(otherSm.members?.name ?? "");
        partnerId = otherSm.member_id;
      }
      team = {
        init1: initialOf(selfSm?.members?.name ?? ""),
        tone1: asTone(selfSm?.members?.avatar_tone),
        init2: initialOf(otherSm?.members?.name ?? ""),
        tone2: asTone(otherSm?.members?.avatar_tone),
      };
    }
    meta.set(mid, { type: isTeam ? "2on1" : "1on1", weekdays, hour, minute, team, partnerNames, partnerId });
  }
  return meta;
}

function scheduleLabel(weekdays: number[], hour: number): string {
  if (weekdays.length === 0) return "정기 일정 미설정";
  const days = weekdays.map((w) => WD[w]).join("·");
  const period = hour < 12 ? "오전" : "오후";
  const h12 = hour <= 12 ? hour : hour - 12;
  return `매주 ${days} ${period} ${h12}시`;
}

function badgeForMember(dDay: number | null): BadgeView {
  if (dDay !== null && isExpiringWindow(dDay)) {
    const variant: BadgeView["variant"] = dDay <= 5 ? "expiringNear" : "expiringSoon";
    return { text: `D-${dDay}`, variant };
  }
  return { text: "활성", variant: "active" };
}

export async function getMembers(filter: MemberFilter = "all"): Promise<MembersView> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";

  type MRow = { id: string; name: string; status: "active" | "rest" | "inactive"; avatar_tone: string };
  let memberRows: MRow[];
  if (me.isOwner) {
    // Owner sees every member in the gym, not just their assigned ones.
    const { data } = await sb.from("members").select("id, name, status, avatar_tone");
    memberRows = (data ?? []) as MRow[];
  } else {
    const { data: links } = await sb
      .from("member_trainers")
      .select("members(id, name, status, avatar_tone)")
      .eq("trainer_id", trainerId);
    type Link = { members: MRow | null };
    memberRows = ((links ?? []) as unknown as Link[])
      .map((l) => l.members)
      .filter((m): m is MRow => !!m);
  }

  const memberIds = memberRows.map((m) => m.id);
  const today = todayISO();

  // active memberships -> remaining + dDay
  const { data: msRows } = memberIds.length
    ? await sb
        .from("memberships")
        .select("member_id, remaining_sessions, end_date, status")
        .in("member_id", memberIds)
        .eq("status", "active")
    : { data: [] as { member_id: string; remaining_sessions: number; end_date: string; status: string }[] };

  const msByMember = new Map<string, { remaining: number; dDay: number }>();
  for (const r of (msRows ?? []) as { member_id: string; remaining_sessions: number; end_date: string }[]) {
    msByMember.set(r.member_id, { remaining: r.remaining_sessions, dDay: dayDiff(today, r.end_date) });
  }

  const meta = await scheduleMetaOf(me.isOwner ? null : trainerId, memberIds);

  const enriched = memberRows.map((m) => {
    const ms = msByMember.get(m.id);
    const dDay = ms ? ms.dDay : null;
    const isExpiring = dDay !== null && isExpiringWindow(dDay);
    const sm = meta.get(m.id);
    const isTeam = sm?.type === "2on1";
    const remaining = ms?.remaining ?? 0;
    const kind = isTeam ? "2:1" : "1:1";
    const days = sm ? sm.weekdays.map((w) => WD[w]).join("·") : "";
    const time = sm ? hmLabel(sm.hour, sm.minute) : "";
    const sub = sm ? `${kind} · ${days} ${time} · 잔여 ${remaining}회` : `${kind} · 잔여 ${remaining}회`;
    // derived status for filtering: rest stays rest; expiring overrides active
    const derivedStatus: "active" | "expiring" | "rest" | "inactive" =
      m.status === "rest" ? "rest" : m.status === "inactive" ? "inactive" : isExpiring ? "expiring" : "active";
    return {
      id: m.id,
      name: m.name,
      initial: initialOf(m.name),
      avatarTone: asTone(m.avatar_tone),
      isTeam,
      team: sm?.team,
      sub,
      badge: badgeForMember(dDay),
      _status: derivedStatus,
    };
  });

  const totalActive = enriched.filter((m) => m._status !== "rest" && m._status !== "inactive").length;
  const expiringCount = enriched.filter((m) => m._status === "expiring").length;
  const restCount = enriched.filter((m) => m._status === "rest").length;

  let pool = enriched;
  if (filter === "expiring") pool = enriched.filter((m) => m._status === "expiring");
  else if (filter === "active") pool = enriched.filter((m) => m._status === "active");
  else if (filter === "rest") pool = enriched.filter((m) => m._status === "rest");

  return {
    totals: { total: totalActive, expiring: expiringCount, rest: restCount },
    filter,
    items: pool.map((m) => ({
      id: m.id,
      name: m.name,
      initial: m.initial,
      avatarTone: m.avatarTone,
      isTeam: m.isTeam,
      team: m.team,
      sub: m.sub,
      badge: m.badge,
    })),
  };
}

/**
 * Full members payload for the list client island: the "all" view plus a per-member
 * derived-status map so the island can apply the filter chips locally (no round-trip),
 * matching getMembers(filter) exactly.
 */
export async function getMembersAll(): Promise<{
  view: MembersView;
  statusById: Record<string, "active" | "expiring" | "rest" | "inactive">;
}> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";

  type MRow = { id: string; name: string; status: "active" | "rest" | "inactive"; avatar_tone: string };
  let memberRows: MRow[];
  if (me.isOwner) {
    // Owner sees every member in the gym, not just their assigned ones.
    const { data } = await sb.from("members").select("id, name, status, avatar_tone");
    memberRows = (data ?? []) as MRow[];
  } else {
    const { data: links } = await sb
      .from("member_trainers")
      .select("members(id, name, status, avatar_tone)")
      .eq("trainer_id", trainerId);
    type Link = { members: MRow | null };
    memberRows = ((links ?? []) as unknown as Link[])
      .map((l) => l.members)
      .filter((m): m is MRow => !!m);
  }
  const memberIds = memberRows.map((m) => m.id);
  const today = todayISO();

  const { data: msRows } = memberIds.length
    ? await sb
        .from("memberships")
        .select("member_id, remaining_sessions, end_date, status")
        .in("member_id", memberIds)
        .eq("status", "active")
    : { data: [] as { member_id: string; remaining_sessions: number; end_date: string; status: string }[] };
  const msByMember = new Map<string, { remaining: number; dDay: number }>();
  for (const r of (msRows ?? []) as { member_id: string; remaining_sessions: number; end_date: string }[]) {
    msByMember.set(r.member_id, { remaining: r.remaining_sessions, dDay: dayDiff(today, r.end_date) });
  }

  const meta = await scheduleMetaOf(me.isOwner ? null : trainerId, memberIds);
  const statusById: Record<string, "active" | "expiring" | "rest" | "inactive"> = {};
  const rowById = new Map(memberRows.map((m) => [m.id, m]));

  // 상태는 회원별로 전부 채운다(카운트·필터의 기준). 리스트 카드는 2:1 팀을 한 장으로 묶는다.
  for (const m of memberRows) {
    const ms = msByMember.get(m.id);
    const dDay = ms ? ms.dDay : null;
    const isExpiring = dDay !== null && isExpiringWindow(dDay);
    statusById[m.id] =
      m.status === "rest" ? "rest" : m.status === "inactive" ? "inactive" : isExpiring ? "expiring" : "active";
  }

  const absorbed = new Set<string>(); // 대표 카드에 흡수된 파트너
  const items: MemberListItem[] = [];
  for (const m of memberRows) {
    if (absorbed.has(m.id)) continue;
    const ms = msByMember.get(m.id);
    const dDay = ms ? ms.dDay : null;
    const sm = meta.get(m.id);
    const isTeam = sm?.type === "2on1";
    const remaining = ms?.remaining ?? 0;
    const days = sm ? sm.weekdays.map((w) => WD[w]).join("·") : "";
    const time = sm ? hmLabel(sm.hour, sm.minute) : "";

    // 2:1 팀 = 카드 한 장("박성주·이은비"). 잔여·D-day는 두 명 중 급한 쪽 기준.
    const partner = isTeam && sm?.partnerId ? rowById.get(sm.partnerId) : undefined;
    if (partner) {
      absorbed.add(partner.id);
      const pms = msByMember.get(partner.id);
      const dDays = [dDay, pms ? pms.dDay : null].filter((v): v is number => v !== null);
      const teamDday = dDays.length ? Math.min(...dDays) : null;
      if (statusById[partner.id] === "expiring") statusById[m.id] = statusById[m.id] === "inactive" || statusById[m.id] === "rest" ? statusById[m.id] : "expiring";
      items.push({
        id: m.id,
        name: `${m.name}·${partner.name}`,
        initial: initialOf(m.name),
        avatarTone: asTone(m.avatar_tone),
        isTeam: true,
        team: sm?.team,
        sub: `2:1 · ${days} ${time} · 잔여 ${remaining}·${pms?.remaining ?? 0}회`,
        badge: badgeForMember(teamDday),
      });
      continue;
    }

    const kind = isTeam ? "2:1" : "1:1";
    const sub = sm ? `${kind} · ${days} ${time} · 잔여 ${remaining}회` : `${kind} · 잔여 ${remaining}회`;
    items.push({
      id: m.id,
      name: m.name,
      initial: initialOf(m.name),
      avatarTone: asTone(m.avatar_tone),
      isTeam,
      team: sm?.team,
      sub,
      badge: badgeForMember(dDay),
    });
  }

  const statuses = Object.values(statusById);
  const totalActive = statuses.filter((s) => s !== "rest" && s !== "inactive").length;
  const expiringCount = statuses.filter((s) => s === "expiring").length;
  const restCount = statuses.filter((s) => s === "rest").length;

  return {
    view: { totals: { total: totalActive, expiring: expiringCount, rest: restCount }, filter: "all", items },
    statusById,
  };
}

/* ------------------------------ member detail ------------------------------ */

export async function getMemberDetail(id: string): Promise<MemberDetailView> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";
  const today = todayISO();

  // 강사는 담당 회원만 상세 열람(대표는 전체) — 임의 id로 타 강사 회원 PII를 열람하는 IDOR 차단(감사 #13).
  let allowed = me.isOwner;
  if (!allowed && trainerId) {
    const { data: link } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("member_id", id)
      .eq("trainer_id", trainerId)
      .maybeSingle();
    allowed = !!link;
  }
  if (!allowed) {
    // 빈 껍데기 반환 — 회원권·인바디·일정 서브쿼리까지 전부 차단.
    return {
      id, name: "", phone: "", gender: null, isTeam: false, team: undefined,
      initial: "", avatarTone: asTone("sage"), badge: badgeForMember(null),
      typeLabel: "1:1 PT", product: "1:1 PT", remaining: 0, total: 0, dDay: 0,
      startDate: "", endDate: "", barPct: 0,
      body: { weight: 0, skeletalMuscle: 0, bodyFat: 0 },
      schedule: "정기 일정 미설정", injury: undefined,
      activeMembershipId: null, membershipPaused: false, memberStatus: "active", events: [],
    };
  }

  const { data: member } = await sb
    .from("members")
    .select("id, name, phone, gender, status, avatar_tone, injury_note")
    .eq("id", id)
    .maybeSingle();

  const m = (member ?? {
    id,
    name: "",
    phone: "",
    gender: null,
    status: "active" as const,
    avatar_tone: "sage",
    injury_note: null,
  }) as { id: string; name: string; phone: string; gender: "female" | "male" | null; status: "active" | "rest" | "inactive"; avatar_tone: string; injury_note: string | null };

  // 현재 회원권: 활성 우선, 없으면 정지(paused)된 것. (정지 중엔 차감/만료 동결, 화면엔 표시)
  const { data: msRows } = await sb
    .from("memberships")
    .select("id, product, total_sessions, remaining_sessions, start_date, end_date, status")
    .eq("member_id", id)
    .in("status", ["active", "paused"])
    .order("end_date", { ascending: false })
    .limit(5);
  const msAll = (msRows ?? []) as { id: string; product: string; total_sessions: number; remaining_sessions: number; start_date: string; end_date: string; status: string }[];
  const ms = msAll.find((r) => r.status === "active") ?? msAll[0];
  const membershipPaused = ms?.status === "paused";

  // membership events — most recent 5 for the active membership
  let events: { type: string; note: string | null; createdAt: string }[] = [];
  if (ms) {
    const { data: evRows } = await sb
      .from("membership_events")
      .select("type, note, created_at")
      .eq("membership_id", ms.id)
      .order("created_at", { ascending: false })
      .limit(5);
    events = ((evRows ?? []) as { type: string; note: string | null; created_at: string }[]).map((e) => ({
      type: e.type,
      note: e.note,
      createdAt: kstDateISO(e.created_at),
    }));
  }

  const meta = await scheduleMetaOf(me.isOwner ? null : trainerId, [id]);
  const sm = meta.get(id);
  const isTeam = sm?.type === "2on1";

  const dDay = ms ? dayDiff(today, ms.end_date) : 0;
  const remaining = ms?.remaining_sessions ?? 0;
  const total = ms?.total_sessions ?? 0;
  const barPct = total > 0 ? Math.round((remaining / total) * 100) : 0;
  const typeLabel = isTeam ? "2:1 PT" : "1:1 PT";
  const productLabel = ms ? `${typeLabel} ${ms.product}회권` : typeLabel;

  // latest body composition
  const { data: bodyRows } = await sb
    .from("body_compositions")
    .select("weight, skeletal_muscle, body_fat")
    .eq("member_id", id)
    .order("measured_at", { ascending: false })
    .limit(1);
  const bodyRow = (bodyRows ?? [])[0] as { weight: number; skeletal_muscle: number; body_fat: number } | undefined;
  const body = {
    weight: Number(bodyRow?.weight ?? 0),
    skeletalMuscle: Number(bodyRow?.skeletal_muscle ?? 0),
    bodyFat: Number(bodyRow?.body_fat ?? 0),
  };

  return {
    id: m.id,
    name: m.name,
    phone: m.phone ?? "",
    gender: m.gender,
    isTeam: !!isTeam,
    team: sm?.team,
    partnerId: sm?.partnerId,
    partnerName: sm?.partnerNames[0] || undefined,
    initial: initialOf(m.name),
    avatarTone: asTone(m.avatar_tone),
    badge: badgeForMember(ms ? dDay : null),
    typeLabel,
    product: productLabel,
    remaining,
    total,
    dDay,
    startDate: ms ? ms.start_date.replace(/-/g, ".") : "",
    endDate: ms ? ms.end_date.replace(/-/g, ".") : "",
    barPct,
    body,
    schedule: sm ? scheduleLabel(sm.weekdays, sm.hour) : "정기 일정 미설정",
    injury: m.injury_note ?? undefined,
    activeMembershipId: ms?.id ?? null,
    membershipPaused,
    memberStatus: m.status,
    events,
  };
}

/**
 * Resolve the record-screen href for a member's "기록" button: link to the member's
 * most recent session (upcoming preferred, else latest past) so the record route — which
 * keys on a real session id — resolves. Falls back to the member id if none exists.
 */
export async function getMemberRecordHref(memberId: string): Promise<string> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";
  const now = new Date().toISOString();

  // nearest upcoming session for this member with this trainer
  const upcoming = await sb
    .from("sessions")
    .select("id, scheduled_at, session_members!inner(member_id)")
    .eq("trainer_id", trainerId)
    .eq("session_members.member_id", memberId)
    .gte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(1);
  const up = (upcoming.data ?? [])[0] as { id: string } | undefined;
  if (up) return `/t/record/${up.id}`;

  // else latest past session
  const past = await sb
    .from("sessions")
    .select("id, scheduled_at, session_members!inner(member_id)")
    .eq("trainer_id", trainerId)
    .eq("session_members.member_id", memberId)
    .lt("scheduled_at", now)
    .order("scheduled_at", { ascending: false })
    .limit(1);
  const pa = (past.data ?? [])[0] as { id: string } | undefined;
  if (pa) return `/t/record/${pa.id}`;

  return `/t/record/${memberId}`;
}

/* ------------------------------------------------- my stats (강사 본인) */
export interface MyStats {
  monthLabel: string; // "2026년 7월"
  monthTotal: number; // 이번 달 수업(취소 제외)
  attended: number;   // 완료
  upcoming: number;   // 예정
  noshow: number;     // 노쇼
  weekTotal: number;  // 이번 주 수업(취소 제외)
  memberCount: number; // 담당 회원 수
}

/** 강사 본인 수업 현황 — 이번 달/주 수업 수와 상태별 집계, 담당 회원 수. 로그인 트레이너 스코프. */
export async function getMyStats(): Promise<MyStats> {
  const t = await getTrainerContext();
  const empty: MyStats = { monthLabel: currentMonthLabel(), monthTotal: 0, attended: 0, upcoming: 0, noshow: 0, weekTotal: 0, memberCount: 0 };
  if (!t) return empty;

  const { startISO, endISO } = monthBoundsKst();
  const { startISO: wkS, endISO: wkE } = weekBoundsKst();
  const [{ data: sess }, weekRes, memberRes] = await Promise.all([
    sb.from("sessions").select("status").eq("trainer_id", t.id).gte("scheduled_at", startISO).lt("scheduled_at", endISO),
    sb.from("sessions").select("id", { count: "exact", head: true }).eq("trainer_id", t.id).neq("status", "cancelled").gte("scheduled_at", wkS).lt("scheduled_at", wkE),
    sb.from("member_trainers").select("member_id", { count: "exact", head: true }).eq("trainer_id", t.id),
  ]);

  let attended = 0, upcoming = 0, noshow = 0;
  for (const s of (sess ?? []) as { status: string }[]) {
    if (s.status === "attended") attended++;
    else if (s.status === "scheduled") upcoming++;
    else if (s.status === "noshow") noshow++;
  }
  return {
    ...empty,
    monthTotal: attended + upcoming + noshow,
    attended,
    upcoming,
    noshow,
    weekTotal: weekRes.count ?? 0,
    memberCount: memberRes.count ?? 0,
  };
}
