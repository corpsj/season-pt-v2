import "server-only";
import {
  sb,
  getTrainerContext,
  kstDateISO,
  kstHour,
  hourLabel,
  todayISO,
  dayDiff,
  nowKstParts,
} from "@/lib/data/db";
import type {
  AvatarTone,
  BadgeView,
  CalendarDay,
  Me,
  MemberDetailView,
  MemberFilter,
  MembersView,
  TeamAvatar,
  TrainerCalendarView,
  TrainerDayClass,
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
function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WD[wd]}`;
}

/* --------------------------- trainer calendar --------------------------- */

export async function getTrainerCalendar(iso?: string): Promise<TrainerCalendarView> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";

  const today = todayISO();
  const now = nowKstParts();
  const year = now.getUTCFullYear();
  const month0 = now.getUTCMonth();
  const selectedISO = iso ?? today;

  // month boundaries (KST) -> UTC range covering the whole month
  const monthStartUtc = new Date(Date.UTC(year, month0, 1, -9, 0, 0)).toISOString();
  const monthEndUtc = new Date(Date.UTC(year, month0 + 1, 1, -9, 0, 0)).toISOString();

  // all of this trainer's sessions in the month (+ members)
  const { data: sessRows } = await sb
    .from("sessions")
    .select("id, scheduled_at, type, status, session_members(member_id, members(name, avatar_tone))")
    .eq("trainer_id", trainerId)
    .gte("scheduled_at", monthStartUtc)
    .lt("scheduled_at", monthEndUtc)
    .order("scheduled_at", { ascending: true });

  type Row = {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: "scheduled" | "attended" | "noshow" | "cancelled";
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  const sessions = (sessRows ?? []) as unknown as Row[];

  const dots = new Set<string>();
  for (const s of sessions) dots.add(kstDateISO(s.scheduled_at));

  // expiring count: active memberships of this trainer's members with end_date <= today+14
  const expiringCount = await countExpiring(trainerId, today);

  // inbox count: pending change requests on this trainer's sessions
  const inboxCount = await countInbox(trainerId);

  // selected day's classes
  const dayClasses: TrainerDayClass[] = sessions
    .filter((s) => kstDateISO(s.scheduled_at) === selectedISO)
    .sort((a, b) => kstHour(a.scheduled_at) - kstHour(b.scheduled_at))
    .map((s) => mapDayClass(s, today));

  return {
    meName: me.name,
    meRole: me.roleLabel,
    todayLabel: fullDateLabel(today),
    expiringCount,
    inboxCount,
    hasInbox: inboxCount > 0,
    monthLabel: `${year}년 ${month0 + 1}월`,
    calDays: buildMonthGrid(year, month0, dots, selectedISO),
    selDateLabel: shortDateLabel(selectedISO),
    dayClasses,
  };
}

/**
 * Month payload for the calendar client island: base view (selected = today) plus a
 * map of every date in the month -> that day's classes, so the island can switch the
 * selected day instantly without a round-trip while keeping identical formatting.
 */
export async function getTrainerCalendarMonth(): Promise<{
  base: TrainerCalendarView;
  classesByDate: Record<string, TrainerDayClass[]>;
  todayISO: string;
}> {
  const me = await getMe();
  const trainerId = me.trainerId ?? "";
  const today = todayISO();
  const now = nowKstParts();
  const year = now.getUTCFullYear();
  const month0 = now.getUTCMonth();

  const monthStartUtc = new Date(Date.UTC(year, month0, 1, -9, 0, 0)).toISOString();
  const monthEndUtc = new Date(Date.UTC(year, month0 + 1, 1, -9, 0, 0)).toISOString();

  const { data: sessRows } = await sb
    .from("sessions")
    .select("id, scheduled_at, type, status, session_members(member_id, members(name, avatar_tone))")
    .eq("trainer_id", trainerId)
    .gte("scheduled_at", monthStartUtc)
    .lt("scheduled_at", monthEndUtc)
    .order("scheduled_at", { ascending: true });

  type Row = {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: "scheduled" | "attended" | "noshow" | "cancelled";
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  const sessions = (sessRows ?? []) as unknown as Row[];

  const classesByDate: Record<string, TrainerDayClass[]> = {};
  for (const s of sessions) {
    const dateISO = kstDateISO(s.scheduled_at);
    (classesByDate[dateISO] ??= []).push(mapDayClass(s, today));
  }
  for (const k of Object.keys(classesByDate)) {
    classesByDate[k].sort((a, b) => timeOrder(a.time) - timeOrder(b.time));
  }

  const base = await getTrainerCalendar(today);
  return { base, classesByDate, todayISO: today };
}

function timeOrder(label: string): number {
  // "오전 9:00" / "오후 7:00" -> minutes since midnight (for stable client sort)
  const isPm = label.startsWith("오후");
  const hm = label.replace(/오전 |오후 /, "");
  const [h, m] = hm.split(":").map(Number);
  let hh = h % 12;
  if (isPm) hh += 12;
  return hh * 60 + (m || 0);
}

function mapDayClass(
  s: {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: "scheduled" | "attended" | "noshow" | "cancelled";
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  },
  today: string
): TrainerDayClass {
  const isTeam = s.type === "2on1";
  const names = s.session_members.map((sm) => sm.members?.name ?? "").filter(Boolean);
  const name = names.join("·");
  const sessionISO = kstDateISO(s.scheduled_at);
  const isPastOrToday = dayDiff(sessionISO, today) >= 0;
  const showAttend = s.status === "scheduled" && isPastOrToday;
  let barColor: string;
  if (s.status === "attended") barColor = BAR.attended;
  else if (s.status === "cancelled") barColor = BAR.cancelled;
  else barColor = isTeam ? BAR["2on1"] : BAR["1on1"];
  let badge: BadgeView | undefined;
  if (s.status === "attended") badge = { text: "완료", variant: "done" };
  else if (isTeam) badge = { text: "2:1", variant: "team" };
  else badge = { text: "예정", variant: "scheduled" };
  const href = isTeam ? `/t/attend/${s.id}` : `/t/class/${s.id}`;
  return {
    sessionId: s.id,
    time: hourLabel(kstHour(s.scheduled_at)),
    name,
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
    if (dayDiff(today, r.end_date) <= 14) expiring.add(r.member_id);
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
    { type: "1on1" | "2on1"; weekdays: number[]; hour: number; team?: TeamAvatar; partnerNames: string[] }
  >();
  if (memberIds.length === 0) return meta;

  // Owner views all members → no trainer filter (trainerId null); otherwise scope to the trainer.
  let sq = sb
    .from("schedules")
    .select("id, type, weekday, hour, active, schedule_members(member_id, members(name, avatar_tone))")
    .eq("active", true);
  if (trainerId) sq = sq.eq("trainer_id", trainerId);
  const { data: schedRows } = await sq;

  type SR = {
    id: string;
    type: "1on1" | "2on1";
    weekday: number;
    hour: number;
    schedule_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  const scheds = (schedRows ?? []) as unknown as SR[];

  for (const mid of memberIds) {
    const mine = scheds.filter((s) => s.schedule_members.some((sm) => sm.member_id === mid));
    if (mine.length === 0) continue;
    const weekdays = Array.from(new Set(mine.map((s) => s.weekday))).sort((a, b) => a - b);
    const hour = mine[0].hour;
    const isTeam = mine.some((s) => s.type === "2on1");
    let team: TeamAvatar | undefined;
    const partnerNames: string[] = [];
    if (isTeam) {
      const teamSched = mine.find((s) => s.type === "2on1")!;
      const ms = teamSched.schedule_members;
      const selfSm = ms.find((sm) => sm.member_id === mid);
      const otherSm = ms.find((sm) => sm.member_id !== mid);
      if (otherSm) partnerNames.push(otherSm.members?.name ?? "");
      team = {
        init1: initialOf(selfSm?.members?.name ?? ""),
        tone1: asTone(selfSm?.members?.avatar_tone),
        init2: initialOf(otherSm?.members?.name ?? ""),
        tone2: asTone(otherSm?.members?.avatar_tone),
      };
    }
    meta.set(mid, { type: isTeam ? "2on1" : "1on1", weekdays, hour, team, partnerNames });
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

function badgeForMember(status: "active" | "rest" | "inactive", dDay: number | null): BadgeView {
  if (dDay !== null && dDay <= 14) {
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
    const isExpiring = dDay !== null && dDay <= 14;
    const sm = meta.get(m.id);
    const isTeam = sm?.type === "2on1";
    const remaining = ms?.remaining ?? 0;
    const kind = isTeam ? "2:1" : "1:1";
    const days = sm ? sm.weekdays.map((w) => WD[w]).join("·") : "";
    const time = sm ? hourLabel(sm.hour) : "";
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
      badge: badgeForMember(m.status, dDay),
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

  const items = memberRows.map((m) => {
    const ms = msByMember.get(m.id);
    const dDay = ms ? ms.dDay : null;
    const isExpiring = dDay !== null && dDay <= 14;
    const sm = meta.get(m.id);
    const isTeam = sm?.type === "2on1";
    const remaining = ms?.remaining ?? 0;
    const kind = isTeam ? "2:1" : "1:1";
    const days = sm ? sm.weekdays.map((w) => WD[w]).join("·") : "";
    const time = sm ? hourLabel(sm.hour) : "";
    const sub = sm ? `${kind} · ${days} ${time} · 잔여 ${remaining}회` : `${kind} · 잔여 ${remaining}회`;
    statusById[m.id] =
      m.status === "rest" ? "rest" : m.status === "inactive" ? "inactive" : isExpiring ? "expiring" : "active";
    return {
      id: m.id,
      name: m.name,
      initial: initialOf(m.name),
      avatarTone: asTone(m.avatar_tone),
      isTeam,
      team: sm?.team,
      sub,
      badge: badgeForMember(m.status, dDay),
    };
  });

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

  const { data: member } = await sb
    .from("members")
    .select("id, name, status, avatar_tone, injury_note")
    .eq("id", id)
    .maybeSingle();

  const m = (member ?? {
    id,
    name: "",
    status: "active" as const,
    avatar_tone: "sage",
    injury_note: null,
  }) as { id: string; name: string; status: "active" | "rest" | "inactive"; avatar_tone: string; injury_note: string | null };

  // active membership
  const { data: msRows } = await sb
    .from("memberships")
    .select("product, total_sessions, remaining_sessions, start_date, end_date, status")
    .eq("member_id", id)
    .eq("status", "active")
    .order("end_date", { ascending: false })
    .limit(1);
  const ms = (msRows ?? [])[0] as
    | { product: string; total_sessions: number; remaining_sessions: number; start_date: string; end_date: string }
    | undefined;

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
    isTeam: !!isTeam,
    team: sm?.team,
    initial: initialOf(m.name),
    avatarTone: asTone(m.avatar_tone),
    badge: badgeForMember(m.status, ms ? dDay : null),
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
