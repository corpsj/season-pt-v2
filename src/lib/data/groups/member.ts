import "server-only";
import { cookies } from "next/headers";
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
  AvatarTone,
  CalendarDay,
  ChatMessageView,
  MemberCalendarView,
  MemberMyView,
  MemberNotice,
  MemberNoticesView,
  MemberNotifView,
  MemberPaymentItem,
  MemberPaymentsView,
  MemberPaymentYear,
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
export function clockLabel(iso: string): string {
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
      messages: [] as ChatMessageView[],
      cursor: null as string | null,
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

  const messages: ChatMessageView[] = (msgs ?? []).map((m) => ({
    id: m.id as string,
    mine: m.sender_type === "member",
    text: m.text as string,
    time: clockLabel(m.created_at as string),
    createdAt: m.created_at as string,
  }));

  const cursor =
    msgs && msgs.length ? (msgs[msgs.length - 1].created_at as string) : null;

  return { trainerName, initial, sub, messages, cursor };
}

/** New messages in the member's thread at/after `sinceISO` (or all if null), marking incoming as read. */
export async function loadNewMemberMessages(
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  const me = await getMemberContext();
  if (!me) return [];

  const { data: cp } = await sb
    .from("chat_participants")
    .select("thread_id, chat_threads(id, updated_at)")
    .eq("member_id", me.memberId);
  const threads = (cp ?? [])
    .map(
      (r) =>
        (r as unknown as { chat_threads?: { id: string; updated_at: string } })
          .chat_threads
    )
    .filter((t): t is { id: string; updated_at: string } => !!t)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const thread = threads[0];
  if (!thread) return [];

  let q = sb
    .from("chat_messages")
    .select("id, sender_type, text, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true });
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data: msgs, error: qErr } = await q;
  if (qErr) return [];

  await sb
    .from("chat_messages")
    .update({ read_by_member: true })
    .eq("thread_id", thread.id)
    .eq("sender_type", "trainer")
    .eq("read_by_member", false);

  return (msgs ?? []).map((m) => ({
    id: m.id as string,
    mine: m.sender_type === "member",
    text: m.text as string,
    time: clockLabel(m.created_at as string),
    createdAt: m.created_at as string,
  } satisfies ChatMessageView));
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

/* ============================================================
   my page (/m/my) — design: 마이페이지 (A안 상세).dc.html
   ------------------------------------------------------------
   Notices and notification settings have no backing tables yet;
   notices are a curated source and both keep per-device state in
   cookies (server-readable, so RSC renders the correct initial
   state). View shapes are stable, so a future `notices` /
   `member_notification_settings` table can swap in untouched.
   ============================================================ */

export const NOTICE_READ_COOKIE = "spt_notice_reads";
export const NOTIF_COOKIE = "spt_notif";

/** Curated facility notices (newest first). */
const NOTICES: Omit<MemberNotice, "unread">[] = [
  {
    id: "n-summer-closure",
    tag: "중요",
    tone: "important",
    dateLabel: "08.10",
    title: "여름 휴관 안내 (8/15~8/16)",
    body: "광복절 연휴 기간 전관 휴무입니다. 예약은 8/17부터 가능해요.",
  },
  {
    id: "n-new-reformer",
    tag: "시설",
    tone: "facility",
    dateLabel: "06.18",
    title: "신규 필라테스 기구 입고 안내",
    body: "리포머 2대가 추가 입고되어 예약 슬롯이 늘었어요.",
  },
  {
    id: "n-june-schedule",
    tag: "운영",
    tone: "ops",
    dateLabel: "06.01",
    title: "6월 수업 일정 변경 안내",
    body: "현충일(6/6) 휴무로 일부 수업이 조정됩니다.",
  },
  {
    id: "n-parking",
    tag: "운영",
    tone: "ops",
    dateLabel: "05.20",
    title: "주차장 이용 안내",
    body: "건물 지하 2~3층, 2시간 무료 주차 가능합니다.",
  },
];

/** Notices that start unread (until the member opens 공지사항). */
export const NOTICE_UNREAD_IDS = ["n-summer-closure", "n-new-reformer"] as const;

/** Notification toggles, grouped — with sensible defaults. */
const NOTIF_GROUPS: { title: string; items: { key: string; title: string; sub: string; def: boolean }[] }[] = [
  {
    title: "수업 알림",
    items: [
      { key: "class_status", title: "예약 확정·취소", sub: "예약 상태가 바뀌면 알려드려요", def: true },
      { key: "class_reminder", title: "수업 1시간 전 리마인더", sub: "놓치지 않도록 미리 알림", def: true },
      { key: "attend_deduct", title: "출석·차감 알림", sub: "수업 후 잔여 횟수를 확인", def: false },
    ],
  },
  {
    title: "회원권",
    items: [
      { key: "expiry_soon", title: "만료 임박 안내", sub: "유효기간 D-7부터 안내", def: true },
      { key: "low_sessions", title: "잔여 횟수 소진 임박", sub: "3회 이하로 남으면 알림", def: true },
    ],
  },
  {
    title: "마케팅",
    items: [
      { key: "events", title: "이벤트·혜택 소식", sub: "할인·프로모션 안내", def: false },
      { key: "night_push", title: "야간 푸시 (21–8시)", sub: "늦은 시간 알림 받기", def: false },
    ],
  },
];

/** Valid notification keys (for action-side validation). */
export const NOTIF_KEYS = NOTIF_GROUPS.flatMap((g) => g.items.map((i) => i.key));

async function readNoticeReadIds(): Promise<string[]> {
  const c = await cookies();
  const raw = c.get(NOTICE_READ_COOKIE)?.value;
  if (!raw) return [];
  try {
    const a: unknown = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function unreadNoticeCount(readIds: string[]): number {
  return NOTICE_UNREAD_IDS.filter((id) => !readIds.includes(id)).length;
}

async function readNotifOverrides(): Promise<Record<string, boolean>> {
  const c = await cookies();
  const raw = c.get(NOTIF_COOKIE)?.value;
  if (!raw) return {};
  try {
    const o: unknown = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Number of sessions this member actually attended (누적 출석). */
async function attendedCount(memberId: string): Promise<number> {
  const { data } = await sb
    .from("session_members")
    .select("sessions(status)")
    .eq("member_id", memberId);
  return (data ?? [])
    .map((r) => (r as unknown as { sessions?: { status: string } }).sessions)
    .filter((s): s is { status: string } => !!s && s.status === "attended").length;
}

/** Earliest membership start date (YYYY-MM-DD) — for 함께한 기간. */
async function earliestMembershipStart(memberId: string): Promise<string | null> {
  const { data } = await sb
    .from("memberships")
    .select("start_date")
    .eq("member_id", memberId)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.start_date ?? null;
}

/** "함께한 기간" value/unit from the join date. <12개월 → 개월, else → 년차. */
function joinStat(startISO: string | null, todayISOd: string): { value: string; unit: string } {
  if (!startISO) return { value: "1", unit: "개월" };
  const sy = Number(startISO.slice(0, 4));
  const sm = Number(startISO.slice(5, 7));
  const sd = Number(startISO.slice(8, 10));
  const ty = Number(todayISOd.slice(0, 4));
  const tm = Number(todayISOd.slice(5, 7));
  const td = Number(todayISOd.slice(8, 10));
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  months = Math.max(0, months);
  if (months >= 12) return { value: String(Math.floor(months / 12)), unit: "년차" };
  return { value: String(Math.max(1, months)), unit: "개월" };
}

const MEMBER_STATUS_LABEL: Record<string, string> = {
  active: "활동 중",
  rest: "휴회 중",
  inactive: "비활성",
};

/** Given name (drop the surname) capped at 2 chars — for the round avatars. */
function avatarInitial(name: string): string {
  const given = name.length > 1 ? name.slice(1) : name;
  return given.slice(0, 2) || name.slice(0, 2);
}

/* ----------------------------- A1 · 마이페이지 메인 ----------------------------- */
export async function getMemberMyPage(): Promise<MemberMyView> {
  const me = await requireMember();
  const today = todayISO();

  const [mrow, membership, tr, attended, firstStart, readIds] = await Promise.all([
    sb.from("members").select("name, status, avatar_tone").eq("id", me.memberId).maybeSingle(),
    activeMembership(me.memberId),
    primaryTrainer(me.memberId),
    attendedCount(me.memberId),
    earliestMembershipStart(me.memberId),
    readNoticeReadIds(),
  ]);

  const name = mrow.data?.name ?? me.name;
  const status = mrow.data?.status ?? "active";
  const tone = (mrow.data?.avatar_tone ?? "sage") as AvatarTone;
  const join = joinStat(firstStart, today);

  let membershipView: MemberMyView["membership"] = null;
  if (membership) {
    const total = membership.total_sessions ?? 0;
    const remaining = membership.remaining_sessions ?? 0;
    const dDay = dayDiff(today, membership.end_date);
    membershipView = {
      productLabel: `1:1 PT ${total}회권`,
      remaining,
      total,
      dDay,
      endLabel: String(membership.end_date).replace(/-/g, "."),
      barPct: total > 0 ? Math.round((remaining / total) * 100) : 0,
      expired: membership.status === "expired" || dDay < 0,
    };
  }

  return {
    name,
    initial: avatarInitial(name),
    avatarTone: tone,
    statusLabel: MEMBER_STATUS_LABEL[status] ?? "회원",
    stats: [
      { value: String(attended), unit: "회", label: "누적 출석" },
      { value: join.value, unit: join.unit, label: "함께한 기간" },
      { value: String(unreadNoticeCount(readIds)), unit: "건", label: "미열람 공지" },
    ],
    membership: membershipView,
    trainer: tr ? { name: tr.display_name, sub: "담당 트레이너" } : null,
    unreadNotices: unreadNoticeCount(readIds),
  };
}

/* ----------------------------- A2 · 결제·구매 내역 ----------------------------- */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "카드 결제",
  cash: "현금 결제",
  account: "계좌이체",
};

export async function getMemberPayments(): Promise<MemberPaymentsView> {
  const me = await requireMember();

  const { data: ms } = await sb
    .from("memberships")
    .select("id, total_sessions, status")
    .eq("member_id", me.memberId);
  const memberships = ms ?? [];
  if (!memberships.length) return { totalAmount: 0, totalCount: 0, years: [] };

  const byId = new Map(memberships.map((m) => [m.id, m]));
  const { data: pays } = await sb
    .from("payments")
    .select("id, membership_id, method, amount, paid_at")
    .in(
      "membership_id",
      memberships.map((m) => m.id)
    )
    .order("paid_at", { ascending: false });
  const payments = pays ?? [];

  let totalAmount = 0;
  const items: (MemberPaymentItem & { paidAt: string })[] = payments.map((p) => {
    const m = byId.get(p.membership_id);
    const total = m?.total_sessions ?? 0;
    const done = (m?.status ?? "active") === "active";
    const mm = String(p.paid_at).slice(5, 7);
    const dd = String(p.paid_at).slice(8, 10);
    if (typeof p.amount === "number") totalAmount += p.amount;
    return {
      id: p.id,
      productLabel: `1:1 PT ${total}회권`,
      dateLabel: `${mm}.${dd} · ${PAYMENT_METHOD_LABEL[p.method] ?? "결제"}`,
      amount: p.amount ?? null,
      statusLabel: done ? "결제완료" : "사용완료",
      done,
      paidAt: String(p.paid_at),
    };
  });

  // group by year (paid_at), newest year first
  const yearMap = new Map<string, MemberPaymentItem[]>();
  for (const it of items) {
    const y = it.paidAt.slice(0, 4);
    if (!yearMap.has(y)) yearMap.set(y, []);
    // strip the internal paidAt before exposing
    const { paidAt, ...pub } = it;
    void paidAt;
    yearMap.get(y)!.push(pub);
  }
  const years: MemberPaymentYear[] = [...yearMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, list]) => ({ year, count: list.length, items: list }));

  return { totalAmount, totalCount: payments.length, years };
}

/* ----------------------------- A3 · 공지사항 ----------------------------- */
export async function getMemberNotices(): Promise<MemberNoticesView> {
  await requireMember();
  const readIds = await readNoticeReadIds();
  const notices: MemberNotice[] = NOTICES.map((n) => ({
    ...n,
    unread: (NOTICE_UNREAD_IDS as readonly string[]).includes(n.id) && !readIds.includes(n.id),
  }));
  return { notices, unread: notices.filter((n) => n.unread).length };
}

/* ----------------------------- A4 · 알림 설정 ----------------------------- */
export async function getMemberNotifSettings(): Promise<MemberNotifView> {
  await requireMember();
  const overrides = await readNotifOverrides();
  return {
    groups: NOTIF_GROUPS.map((g) => ({
      title: g.title,
      items: g.items.map((it) => ({
        key: it.key,
        title: it.title,
        sub: it.sub,
        on: typeof overrides[it.key] === "boolean" ? overrides[it.key] : it.def,
      })),
    })),
  };
}
