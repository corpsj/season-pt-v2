import "server-only";
import {
  sb,
  getMemberContext,
  kstDateISO,
  kstHour,
  kstWeekday,
  hourLabel,
  weekdayKo,
  todayISO,
  dayDiff,
  nowKstParts,
} from "@/lib/data/db";
import type {
  CalendarDay,
  MemberCalendarView,
  MemberReceiveView,
  MemberRequestView,
} from "@/lib/types";

/* ------------------------------- helpers ------------------------------- */

/** Resolve the logged-in member or throw (screens are auth-gated). */
async function requireMember() {
  const m = await getMemberContext();
  if (!m) throw new Error("UNAUTHENTICATED");
  return m;
}

/** "6/22 일 · 오후 7:00" — from a timestamptz ISO (KST). */
function slotLabel(iso: string): string {
  const date = kstDateISO(iso); // YYYY-MM-DD
  const mon = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const wd = weekdayKo(kstWeekday(iso));
  return `${mon}/${day} ${wd} · ${hourLabel(kstHour(iso))}`;
}

/** Relative "N분 전 / N시간 전 / N일 전" from a created_at ISO. */
function agoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(diffMs / 60000));
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** "오후 2:14" — chat message clock time (KST). */
function clockLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const mm = String(m).padStart(2, "0");
  if (h < 12) return `오전 ${h === 0 ? 12 : h}:${mm}`;
  if (h === 12) return `오후 12:${mm}`;
  return `오후 ${h - 12}:${mm}`;
}


/** Member's active membership (most recent by start_date). */
async function activeMembership(memberId: string) {
  const { data } = await sb
    .from("memberships")
    .select("id, remaining_sessions, total_sessions, end_date, status")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** First trainer linked to this member (담당 트레이너). */
async function primaryTrainer(memberId: string) {
  const { data } = await sb
    .from("member_trainers")
    .select("trainer_id, trainers(id, display_name)")
    .eq("member_id", memberId)
    .limit(1)
    .maybeSingle();
  const tr = (data as { trainers?: { id: string; display_name: string } } | null)?.trainers;
  return tr ?? null;
}

/* ----------------------------- calendar (/m) ----------------------------- */
export async function getMemberCalendar(iso?: string): Promise<MemberCalendarView> {
  const me = await requireMember();
  const today = todayISO(); // YYYY-MM-DD (KST)
  const selISO = iso ?? today;

  // Month window from the selected (or today's) date.
  const year = Number(selISO.slice(0, 4));
  const month = Number(selISO.slice(5, 7)); // 1-12
  const monthLabel = `${year}년 ${month}월`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndExcl = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // This member's sessions in the month.
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, sessions(id, scheduled_at, status, trainer_id)")
    .eq("member_id", me.memberId);
  const rows = (sm ?? [])
    .map((r) => (r as unknown as {sessions?: { id: string; scheduled_at: string; status: string; trainer_id: string } }).sessions)
    .filter((s): s is { id: string; scheduled_at: string; status: string; trainer_id: string } => !!s)
    .filter((s) => {
      const d = kstDateISO(s.scheduled_at);
      return d >= monthStart && d < monthEndExcl && s.status !== "cancelled";
    });

  const dots = new Set<number>();
  for (const s of rows) dots.add(Number(kstDateISO(s.scheduled_at).slice(8, 10)));

  const calDays: CalendarDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const n = i + 1;
    const dISO = `${year}-${String(month).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    return {
      n,
      dateISO: dISO,
      inMonth: true,
      isSunday: (firstWeekday + i) % 7 === 0,
      hasDot: dots.has(n),
      selected: dISO === selISO,
    };
  });

  // Selected day's session (first non-cancelled).
  const selDay = Number(selISO.slice(8, 10));
  const selWd = (firstWeekday + selDay - 1) % 7;
  const selDateLabel = `${month}월 ${selDay}일 ${weekdayKo(selWd)}`;
  const sessionOnDay = rows
    .filter((s) => kstDateISO(s.scheduled_at) === selISO)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  const tr = await primaryTrainer(me.memberId);
  const membership = await activeMembership(me.memberId);
  const remaining = membership?.remaining_sessions ?? 0;
  const dDay = membership ? dayDiff(today, membership.end_date) : 0;

  // Pending trainer change request on any of this member's sessions.
  let hasTrainerReq = false;
  const sessionIds = rows.map((s) => s.id);
  if (sessionIds.length) {
    const { count } = await sb
      .from("schedule_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_type", "trainer")
      .eq("status", "pending")
      .in("session_id", sessionIds);
    hasTrainerReq = (count ?? 0) > 0;
  }

  // Schedule legend from the member's recurring schedules.
  const scheduleLegend = await scheduleLegendFor(me.memberId);

  return {
    name: me.name,
    remaining,
    dDay,
    hasTrainerReq,
    monthLabel,
    calDays,
    selDateLabel,
    scheduleLegend,
    dayClass: sessionOnDay
      ? {
          sessionId: sessionOnDay.id,
          time: hourLabel(kstHour(sessionOnDay.scheduled_at)),
          trainerName: tr?.display_name ?? "",
        }
      : undefined,
  };
}

/** Per-day data for the selected month so the client can switch days without a round-trip. */
export type MemberCalendarDayMap = {
  firstWeekday: number;
  days: Record<
    string,
    {
      selDateLabel: string;
      dayClass?: { sessionId: string; time: string; trainerName: string };
    }
  >;
};

export async function getMemberCalendarDayMap(iso?: string): Promise<MemberCalendarDayMap> {
  const me = await requireMember();
  const selISO = iso ?? todayISO();
  const year = Number(selISO.slice(0, 4));
  const month = Number(selISO.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndExcl =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const tr = await primaryTrainer(me.memberId);
  const trainerName = tr?.display_name ?? "";

  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, sessions(id, scheduled_at, status)")
    .eq("member_id", me.memberId);
  const rows = (sm ?? [])
    .map((r) => (r as unknown as {sessions?: { id: string; scheduled_at: string; status: string } }).sessions)
    .filter((s): s is { id: string; scheduled_at: string; status: string } => !!s)
    .filter((s) => {
      const d = kstDateISO(s.scheduled_at);
      return d >= monthStart && d < monthEndExcl && s.status !== "cancelled";
    });

  const byDay = new Map<string, { id: string; scheduled_at: string }>();
  for (const s of rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    const d = kstDateISO(s.scheduled_at);
    if (!byDay.has(d)) byDay.set(d, { id: s.id, scheduled_at: s.scheduled_at });
  }

  const days: MemberCalendarDayMap["days"] = {};
  for (let n = 1; n <= daysInMonth; n++) {
    const dISO = `${year}-${String(month).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    const wd = (firstWeekday + n - 1) % 7;
    const sess = byDay.get(dISO);
    days[dISO] = {
      selDateLabel: `${month}월 ${n}일 ${weekdayKo(wd)}`,
      dayClass: sess
        ? { sessionId: sess.id, time: hourLabel(kstHour(sess.scheduled_at)), trainerName }
        : undefined,
    };
  }

  return { firstWeekday, days };
}

/** "정기 수업 매주 수·토 오후 7시" — from the member's recurring schedules. */
async function scheduleLegendFor(memberId: string): Promise<string> {
  const { data } = await sb
    .from("schedule_members")
    .select("schedule_id, schedules(weekday, hour, active)")
    .eq("member_id", memberId);
  const scheds = (data ?? [])
    .map((r) => (r as unknown as {schedules?: { weekday: number; hour: number; active: boolean } }).schedules)
    .filter((s): s is { weekday: number; hour: number; active: boolean } => !!s && s.active);
  if (!scheds.length) return "정기 수업 없음";
  const weekdays = [...new Set(scheds.map((s) => s.weekday))].sort((a, b) => a - b);
  const hour = scheds[0].hour;
  const wdLabel = weekdays.map((w) => weekdayKo(w)).join("·");
  const ampm = hour < 12 ? `오전 ${hour}시` : hour === 12 ? "오후 12시" : `오후 ${hour - 12}시`;
  return `정기 수업 매주 ${wdLabel} ${ampm}`;
}

/* ----------------------------- receive (/m/receive) ----------------------------- */
export async function getMemberReceive(): Promise<MemberReceiveView> {
  const me = await requireMember();

  // This member's session ids.
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id")
    .eq("member_id", me.memberId);
  const sessionIds = (sm ?? []).map((r) => (r as unknown as {session_id: string }).session_id);

  const empty: MemberReceiveView = {
    trainerName: "",
    ago: "",
    before: "",
    slots: [],
  };
  if (!sessionIds.length) return empty;

  const { data: req } = await sb
    .from("schedule_change_requests")
    .select("id, requester_id, reason, original_at, proposed_slots, created_at, session_id")
    .eq("requester_type", "trainer")
    .eq("status", "pending")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!req) return empty;

  const { data: trainer } = await sb
    .from("trainers")
    .select("display_name")
    .eq("id", req.requester_id)
    .maybeSingle();

  const slots = (Array.isArray(req.proposed_slots) ? (req.proposed_slots as string[]) : []).map(
    (iso, i) => ({ id: `r${i + 1}`, label: slotLabel(iso) })
  );

  return {
    trainerName: trainer?.display_name ?? "",
    ago: agoLabel(req.created_at),
    before: req.original_at ? slotLabel(req.original_at) : "",
    reason: req.reason ?? undefined,
    slots,
  };
}

/** Action metadata for the receive screen (request id + per-option slot ISO). */
export type MemberReceiveMeta = {
  requestId: string | null;
  slotIsoById: Record<string, string>;
};

export async function getMemberReceiveMeta(): Promise<MemberReceiveMeta> {
  const me = await requireMember();
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id")
    .eq("member_id", me.memberId);
  const sessionIds = (sm ?? []).map((r) => (r as unknown as {session_id: string }).session_id);
  if (!sessionIds.length) return { requestId: null, slotIsoById: {} };

  const { data: req } = await sb
    .from("schedule_change_requests")
    .select("id, proposed_slots")
    .eq("requester_type", "trainer")
    .eq("status", "pending")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!req) return { requestId: null, slotIsoById: {} };

  const slots = Array.isArray(req.proposed_slots) ? (req.proposed_slots as string[]) : [];
  const slotIsoById: Record<string, string> = {};
  slots.forEach((iso, i) => {
    slotIsoById[`r${i + 1}`] = iso;
  });
  return { requestId: req.id, slotIsoById };
}

/* ----------------------------- request (/m/request) ----------------------------- */
export async function getMemberRequest(): Promise<MemberRequestView> {
  const me = await requireMember();
  const nowIso = nowKstParts().toISOString();

  // Member's next upcoming scheduled session.
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, sessions(id, scheduled_at, status, trainer_id)")
    .eq("member_id", me.memberId);
  const upcoming = (sm ?? [])
    .map((r) => (r as unknown as {sessions?: { id: string; scheduled_at: string; status: string; trainer_id: string } }).sessions)
    .filter((s): s is { id: string; scheduled_at: string; status: string; trainer_id: string } => !!s)
    .filter((s) => s.status === "scheduled" && s.scheduled_at >= nowIso)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  const tr = await primaryTrainer(me.memberId);
  const trainerName = tr?.display_name ?? "";

  if (!upcoming) {
    return {
      sessionId: "",
      dateBox: { weekday: "", day: 0 },
      time: "",
      trainerName,
      slots: [],
    };
  }

  const dISO = kstDateISO(upcoming.scheduled_at);
  const day = Number(dISO.slice(8, 10));
  const weekday = weekdayKo(kstWeekday(upcoming.scheduled_at));
  const hour = kstHour(upcoming.scheduled_at);

  // Proposed alternatives: same hour, next two of the same weekday window (next 2 days +1/+2 wk style mirrors mock).
  const base = new Date(upcoming.scheduled_at);
  const proposals: { id: string; label: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const next = new Date(base.getTime() + (i === 0 ? 1 : 3) * 86400000);
    proposals.push({ id: i === 0 ? "a" : "b", label: slotLabel(next.toISOString()) });
  }

  return {
    sessionId: upcoming.id,
    dateBox: { weekday, day },
    time: hourLabel(hour),
    trainerName,
    slots: proposals,
  };
}

/** Action metadata for the request screen (per-option proposed slot ISO). */
export type MemberRequestMeta = { slotIsoById: Record<string, string> };

export async function getMemberRequestMeta(): Promise<MemberRequestMeta> {
  const req = await getMemberRequest();
  if (!req.sessionId || !req.slots.length) return { slotIsoById: {} };

  // Recompute the same proposal ISO strings as getMemberRequest (deterministic).
  const me = await requireMember();
  const nowIso = nowKstParts().toISOString();
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, sessions(id, scheduled_at, status)")
    .eq("member_id", me.memberId);
  const upcoming = (sm ?? [])
    .map((r) => (r as unknown as {sessions?: { id: string; scheduled_at: string; status: string } }).sessions)
    .filter((s): s is { id: string; scheduled_at: string; status: string } => !!s)
    .filter((s) => s.status === "scheduled" && s.scheduled_at >= nowIso)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  if (!upcoming) return { slotIsoById: {} };

  const base = new Date(upcoming.scheduled_at);
  const slotIsoById: Record<string, string> = {};
  slotIsoById["a"] = new Date(base.getTime() + 1 * 86400000).toISOString();
  slotIsoById["b"] = new Date(base.getTime() + 3 * 86400000).toISOString();
  return { slotIsoById };
}

/* ----------------------------- chat (/m/chat) ----------------------------- */
export async function getMemberChatRoom() {
  const me = await requireMember();

  // The member's thread (via chat_participants).
  const { data: cp } = await sb
    .from("chat_participants")
    .select("thread_id, chat_threads(id, trainer_id, type, updated_at)")
    .eq("member_id", me.memberId);
  const threads = (cp ?? [])
    .map((r) => (r as unknown as {chat_threads?: { id: string; trainer_id: string; type: string; updated_at: string } }).chat_threads)
    .filter((t): t is { id: string; trainer_id: string; type: string; updated_at: string } => !!t)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const thread = threads[0];

  const tr = await primaryTrainer(me.memberId);
  const trainerName = tr?.display_name ?? "";
  const initial = trainerName ? trainerName.charAt(0) : "트";
  const sub = "담당 트레이너";

  if (!thread) {
    return {
      trainerName,
      initial,
      sub,
      messages: [] as { id: string; mine: boolean; text: string; time?: string }[],
    };
  }

  const { data: msgs } = await sb
    .from("chat_messages")
    .select("id, sender_type, text, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });

  // Mark trainer messages as read by this member.
  await sb
    .from("chat_messages")
    .update({ read_by_member: true })
    .eq("thread_id", thread.id)
    .eq("sender_type", "trainer")
    .eq("read_by_member", false);

  return {
    trainerName,
    initial,
    sub,
    messages: (msgs ?? []).map((m) => ({
      id: m.id,
      mine: m.sender_type === "member",
      text: m.text,
      time: clockLabel(m.created_at),
    })),
  };
}

/* ----------------------------- tab badge ----------------------------- */
/** Member's unread = count of trainer messages not yet read by this member, in their threads. */
export async function getMemberChatUnread(): Promise<number> {
  const me = await getMemberContext();
  if (!me) return 0;
  const { data: cp } = await sb
    .from("chat_participants")
    .select("thread_id")
    .eq("member_id", me.memberId);
  const threadIds = (cp ?? []).map((r) => (r as unknown as {thread_id: string }).thread_id);
  if (!threadIds.length) return 0;
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds)
    .eq("sender_type", "trainer")
    .eq("read_by_member", false);
  return count ?? 0;
}
