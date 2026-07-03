import "server-only";
import { cookies } from "next/headers";
import {
  sb,
  getMemberContext,
  kstDateISO,
  kstWeekday,
  weekdayKo,
  hmLabel,
  todayISO,
  dayDiff,
} from "@/lib/data/db";
import { monthBoundsFromKst } from "@/lib/data/kst-bounds";
import { ensureChatThread } from "@/lib/data/groups/chat";
import { FILES_BUCKET } from "@/lib/data/groups/member-files";
import type {
  AvatarTone,
  CalendarDay,
  ChatMessageView,
  MemberCalendarView,
  MemberDayClass,
  MemberMyView,
  MemberNotice,
  MemberNoticesView,
  MemberNotifView,
  MemberPaymentItem,
  MemberPaymentsView,
  MemberPaymentYear,
  MemberReceiveView,
  MemberRequestView,
  MemberWorkoutRecord,
  MemberWorkoutView,
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
  return `${mon}/${day} ${wd} · ${clockLabel(iso)}`;
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

/** Member's active membership = 만료가 가장 임박한 것(end_date asc) — 차감 대상과 동일 기준.
 *  표시 전용(카드/배지) — 실제 차감 대상 조회는 scheduling-actions.ts의 별도 activeMembership을 쓴다(감사 C2, 건드리지 말 것). */
async function activeMembership(memberId: string) {
  // 실제로 쓸 수 있는(잔여>0) 활성/일시정지 회원권 우선 — 재등록 시 새 회원권이 표시 대상이 되도록(감사 C2).
  // paused도 포함 — 일시정지 중에도 카드/배지가 사라지지 않아야 함(감사3 #10).
  const usable = await sb
    .from("memberships")
    .select("id, remaining_sessions, total_sessions, end_date, status")
    .eq("member_id", memberId)
    .in("status", ["active", "paused"])
    .gt("remaining_sessions", 0)
    .order("end_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (usable.data) return usable.data;
  // 없으면(전부 소진) 카드가 비지 않도록 가장 최근 활성/일시정지 회원권을 보여준다(잔여 0으로 표시).
  const { data } = await sb
    .from("memberships")
    .select("id, remaining_sessions, total_sessions, end_date, status")
    .eq("member_id", memberId)
    .in("status", ["active", "paused"])
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data;
  // 둘 다 없으면(전부 만료/환불) 만료 직후에도 "몇 회 남기고 만료됐는지" 보여준다(감사3 #10).
  // refunded는 표시하지 않음.
  const { data: expired } = await sb
    .from("memberships")
    .select("id, remaining_sessions, total_sessions, end_date, status")
    .eq("member_id", memberId)
    .eq("status", "expired")
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return expired;
}

/** First trainer linked to this member (담당 선생님). */
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

  // Sessions + membership/legend are all independent → fetch concurrently.
  // (선택일 수업 카드는 getMemberCalendarDayMap.dayClasses가 담당 — 여기선 달력 도트/배지만)
  const [{ data: sm }, membership, scheduleLegend] = await Promise.all([
    sb
      .from("session_members")
      .select("session_id, sessions(id, scheduled_at, status, trainer_id)")
      .eq("member_id", me.memberId),
    activeMembership(me.memberId),
    scheduleLegendFor(me.memberId),
  ]);
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

  const selDay = Number(selISO.slice(8, 10));
  const selWd = (firstWeekday + selDay - 1) % 7;
  const selDateLabel = `${month}월 ${selDay}일 ${weekdayKo(selWd)}`;

  const remaining = membership?.remaining_sessions ?? 0;
  const dDay = membership ? dayDiff(today, membership.end_date) : 0;

  // Pending trainer change request on ANY of this member's sessions — must not be scoped to
  // the viewed month, or a request for a session in another month leaves the member with no
  // signal to act on it.
  let hasTrainerReq = false;
  const allSessionIds = (sm ?? [])
    .map((r) => (r as unknown as { sessions?: { id: string } }).sessions?.id)
    .filter((id): id is string => !!id);
  if (allSessionIds.length) {
    const { count } = await sb
      .from("schedule_change_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_type", "trainer")
      .eq("status", "pending")
      .in("session_id", allSessionIds);
    hasTrainerReq = (count ?? 0) > 0;
  }

  const paused = !!membership && membership.status === "paused";
  return {
    name: me.name,
    remaining,
    dDay,
    hasMembership: !!membership,
    expired: !!membership && (membership.status === "expired" || (dDay < 0 && !paused)),
    paused,
    hasTrainerReq,
    monthLabel,
    calDays,
    selDateLabel,
    scheduleLegend,
  };
}

/* -------- 캘린더 날짜별 기록 (운동·식단·체형) — 마이탭 상세 화면의 요약본 -------- */
export type MemberDayWorkout = {
  id: string;
  time: string; // "오후 7:00" (수업 시각)
  exercises: { name: string; kg: number; sets: number }[];
  comment: string | null;
};
export type MemberDayMeal = {
  id: string;
  time: string; // "오후 12:30"
  mealType: string | null;
  memo: string | null;
  photoUrl: string | null;
  feedback: string | null;
};
export type MemberDayFile = {
  id: string;
  kind: "photo" | "inbody";
  url: string | null;
};

/** Per-day data for the selected month so the client can switch days without a round-trip. */
export type MemberCalendarDayMap = {
  firstWeekday: number;
  days: Record<
    string,
    {
      selDateLabel: string;
      // 하루에 수업이 2개(보강 등)여도 전부 노출 — 첫 세션만 보여 두 번째 수업이 회원 화면에서
      // 보이지도, 변경 요청도 불가하던 문제(감사 #38).
      dayClasses: MemberDayClass[];
      workouts: MemberDayWorkout[];
      meals: MemberDayMeal[];
      files: MemberDayFile[];
    }
  >;
};

/** workout_records.exercises(jsonb) → 안전 파싱. 기록 목록·캘린더 공용. */
function parseExercises(raw: unknown): { name: string; kg: number; sets: number }[] {
  return (Array.isArray(raw) ? raw : [])
    .map((e) => e as { name?: unknown; kg?: unknown; sets?: unknown })
    .filter((e) => typeof e?.name === "string")
    .map((e) => ({ name: String(e.name), kg: Number(e.kg) || 0, sets: Number(e.sets) || 0 }));
}

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

  const [tr, { data: sm }] = await Promise.all([
    primaryTrainer(me.memberId),
    sb
      .from("session_members")
      .select("session_id, sessions(id, scheduled_at, status)")
      .eq("member_id", me.memberId),
  ]);
  const trainerName = tr?.display_name ?? "";
  const rows = (sm ?? [])
    .map((r) => (r as unknown as {sessions?: { id: string; scheduled_at: string; status: string } }).sessions)
    .filter((s): s is { id: string; scheduled_at: string; status: string } => !!s)
    .filter((s) => {
      const d = kstDateISO(s.scheduled_at);
      return d >= monthStart && d < monthEndExcl && s.status !== "cancelled";
    });

  const nowIso = new Date().toISOString();
  const byDay = new Map<string, { id: string; scheduled_at: string }[]>();
  for (const s of rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    const d = kstDateISO(s.scheduled_at);
    const arr = byDay.get(d) ?? [];
    arr.push({ id: s.id, scheduled_at: s.scheduled_at });
    byDay.set(d, arr);
  }

  // ---- 이 달의 기록(운동·식단·체형)도 날짜별로 함께 내려준다 — 캘린더에서 그날의 기록을 바로 본다.
  const sessionIds = rows.map((s) => s.id);
  // KST 월 경계 → UTC instant (meal_logs.eaten_at 범위 쿼리용)
  const { startISO: monthStartUtc, endISO: monthEndUtc } = monthBoundsFromKst(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  const [mlRes, mfRes, wrRes] = await Promise.all([
    sb
      .from("meal_logs")
      .select("id, photo_path, memo, meal_type, eaten_at, feedback")
      .eq("member_id", me.memberId)
      .gte("eaten_at", monthStartUtc)
      .lt("eaten_at", monthEndUtc)
      .order("eaten_at", { ascending: true }),
    sb
      .from("member_files")
      .select("id, kind, storage_path, taken_at")
      .eq("member_id", me.memberId)
      .gte("taken_at", monthStart)
      .lt("taken_at", monthEndExcl)
      .order("taken_at", { ascending: true }),
    // 이 달 세션에 달린 운동 기록만 — 세션이 삭제된 고아 기록은 날짜가 없어 캘린더에선 제외(/m/my/records엔 남음).
    sessionIds.length
      ? sb.from("workout_records").select("id, session_id, exercises, comment").in("session_id", sessionIds)
      : Promise.resolve({ data: null }),
  ]);
  const mealRows = (mlRes.data ?? []) as unknown as {
    id: string; photo_path: string | null; memo: string | null; meal_type: string | null; eaten_at: string; feedback: string | null;
  }[];
  const fileRows = (mfRes.data ?? []) as unknown as {
    id: string; kind: "photo" | "inbody"; storage_path: string; taken_at: string;
  }[];
  const workoutRows = (wrRes.data ?? []) as unknown as {
    id: string; session_id: string; exercises: unknown; comment: string | null;
  }[];

  // 서명 URL은 한 번에(batch) — 건당 왕복이면 한 달치 사진에서 수십 회 왕복이 된다.
  const paths = [
    ...mealRows.map((m) => m.photo_path).filter((p): p is string => !!p),
    ...fileRows.map((f) => f.storage_path),
  ];
  const signedByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signs } = await sb.storage.from(FILES_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const s of signs ?? []) if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
  }

  const scheduledById = new Map(rows.map((s) => [s.id, s.scheduled_at]));
  const workoutsByDay = new Map<string, MemberDayWorkout[]>();
  for (const w of workoutRows) {
    const at = scheduledById.get(w.session_id);
    if (!at) continue;
    const d = kstDateISO(at);
    const arr = workoutsByDay.get(d) ?? [];
    arr.push({ id: w.id, time: clockLabel(at), exercises: parseExercises(w.exercises), comment: w.comment ?? null });
    workoutsByDay.set(d, arr);
  }
  const mealsByDay = new Map<string, MemberDayMeal[]>();
  for (const m of mealRows) {
    const d = kstDateISO(m.eaten_at);
    const arr = mealsByDay.get(d) ?? [];
    arr.push({
      id: m.id,
      time: clockLabel(m.eaten_at),
      mealType: m.meal_type ?? null,
      memo: m.memo ?? null,
      photoUrl: m.photo_path ? (signedByPath.get(m.photo_path) ?? null) : null,
      feedback: m.feedback ?? null,
    });
    mealsByDay.set(d, arr);
  }
  const filesByDay = new Map<string, MemberDayFile[]>();
  for (const f of fileRows) {
    const arr = filesByDay.get(f.taken_at) ?? [];
    arr.push({ id: f.id, kind: f.kind, url: signedByPath.get(f.storage_path) ?? null });
    filesByDay.set(f.taken_at, arr);
  }

  const days: MemberCalendarDayMap["days"] = {};
  for (let n = 1; n <= daysInMonth; n++) {
    const dISO = `${year}-${String(month).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    const wd = (firstWeekday + n - 1) % 7;
    days[dISO] = {
      selDateLabel: `${month}월 ${n}일 ${weekdayKo(wd)}`,
      dayClasses: (byDay.get(dISO) ?? []).map((sess) => ({
        sessionId: sess.id,
        time: clockLabel(sess.scheduled_at),
        trainerName,
        isPast: sess.scheduled_at < nowIso,
      })),
      workouts: workoutsByDay.get(dISO) ?? [],
      meals: mealsByDay.get(dISO) ?? [],
      files: filesByDay.get(dISO) ?? [],
    };
  }

  return { firstWeekday, days };
}

/** "정기 수업 매주 수·토 오후 7시" — from the member's recurring schedules. */
async function scheduleLegendFor(memberId: string): Promise<string> {
  const { data } = await sb
    .from("schedule_members")
    .select("schedule_id, schedules(weekday, hour, minute, active)")
    .eq("member_id", memberId);
  const scheds = (data ?? [])
    .map((r) => (r as unknown as {schedules?: { weekday: number; hour: number; minute: number; active: boolean } }).schedules)
    .filter((s): s is { weekday: number; hour: number; minute: number; active: boolean } => !!s && s.active)
    .sort((a, b) => a.weekday - b.weekday);
  if (!scheds.length) return "정기 수업 없음";
  const allSame = scheds.every((s) => s.hour === scheds[0].hour && s.minute === scheds[0].minute);
  if (allSame) {
    const wd = scheds.map((s) => weekdayKo(s.weekday)).join("·");
    return `정기 수업 매주 ${wd} ${hmLabel(scheds[0].hour, scheds[0].minute)}`;
  }
  return "정기 수업 " + scheds.map((s) => `${weekdayKo(s.weekday)} ${hmLabel(s.hour, s.minute)}`).join(" · ");
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
    type: "change",
    sessionId: "",
    slots: [],
  };
  if (!sessionIds.length) return empty;

  const { data: req } = await sb
    .from("schedule_change_requests")
    .select("id, requester_id, reason, original_at, proposed_slots, created_at, session_id, type")
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
    type: (req.type as "change" | "cancel") ?? "change",
    sessionId: req.session_id,
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
/**
 * The session a change/cancel request will target. When `sessionId` is given (deep-link
 * from a tapped calendar day or a trainer request), use that exact session if it's the
 * member's own, still scheduled, and in the future — otherwise fall back to the nearest
 * upcoming session. Past/foreign ids silently fall back (safe).
 */
export async function getMemberRequest(sessionId?: string): Promise<MemberRequestView> {
  const me = await requireMember();
  const nowIso = new Date().toISOString(); // 실제 현재 UTC instant (scheduled_at도 UTC) — KST 보정 금지

  type Cand = { id: string; scheduled_at: string; status: string; trainer_id: string; type: string };
  const { data: sm } = await sb
    .from("session_members")
    .select("session_id, sessions(id, scheduled_at, status, trainer_id, type)")
    .eq("member_id", me.memberId);
  const candidates = (sm ?? [])
    .map((r) => (r as unknown as { sessions?: Cand }).sessions)
    .filter((s): s is Cand => !!s)
    .filter((s) => s.status === "scheduled" && s.scheduled_at >= nowIso)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  // Prefer the explicitly requested session; else the nearest upcoming.
  const target = (sessionId && candidates.find((s) => s.id === sessionId)) || candidates[0];

  const tr = await primaryTrainer(me.memberId);
  const trainerName = tr?.display_name ?? "";

  if (!target) {
    return { sessionId: "", dateBox: { weekday: "", day: 0 }, time: "", timeHM: "", trainerName, isTeam: false };
  }

  const isTeam = target.type === "2on1";
  // 2:1이면 파트너 이름 — 요청 화면에 "함께 변경돼요"를 구체적으로 안내하기 위해.
  let partnerName: string | undefined;
  if (isTeam) {
    const { data: parts } = await sb
      .from("session_members")
      .select("member_id, members(name)")
      .eq("session_id", target.id);
    partnerName = (parts ?? [])
      .filter((p) => p.member_id !== me.memberId)
      .map((p) => (p as unknown as { members: { name: string } | null }).members?.name)
      .find(Boolean) as string | undefined;
  }

  const dISO = kstDateISO(target.scheduled_at);
  const day = Number(dISO.slice(8, 10));
  const weekday = weekdayKo(kstWeekday(target.scheduled_at));
  const kst = new Date(new Date(target.scheduled_at).getTime() + 9 * 3600000);
  const timeHM = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;

  return {
    sessionId: target.id,
    dateBox: { weekday, day },
    time: clockLabel(target.scheduled_at),
    timeHM,
    trainerName,
    isTeam,
    partnerName,
  };
}

/* ----------------------------- chat (/m/chat) ----------------------------- */
/**
 * Ensure the member's chat thread exists, created on first access (registration links
 * member↔trainer but does not seed a chat thread). Resolves the canonical thread — a 2:1
 * group under the class's trainer if the member shares an active 2on1 schedule, else a 1:1
 * under their assigned trainer. Returns the thread id, or null if the member has no trainer.
 */
export async function ensureMemberThread(memberId: string): Promise<string | null> {
  return ensureChatThread(memberId);
}

export async function getMemberChatRoom() {
  const me = await requireMember();

  const tr = await primaryTrainer(me.memberId);
  const trainerName = tr?.display_name ?? "";
  const initial = trainerName ? trainerName.charAt(0) : "트";

  // Ensure the member's thread exists (1:1, or a 2:1 group if they share a 2on1 class).
  const threadId = await ensureMemberThread(me.memberId);
  if (!threadId) {
    return {
      trainerName,
      initial,
      sub: "담당 선생님",
      isTeam: false,
      messages: [] as ChatMessageView[],
      cursor: null as string | null,
      truncated: false,
    };
  }

  const { data: thread } = await sb
    .from("chat_threads")
    .select("type")
    .eq("id", threadId)
    .maybeSingle();
  const isTeam = thread?.type === "2on1";

  // Participant names, for labeling a 2:1 partner's messages.
  const nameById = new Map<string, string>();
  if (isTeam) {
    const { data: parts } = await sb
      .from("chat_participants")
      .select("member_id, members(name)")
      .eq("thread_id", threadId);
    for (const p of (parts ?? []) as unknown as {
      member_id: string;
      members: { name: string } | null;
    }[]) {
      if (p.members?.name) nameById.set(p.member_id, p.members.name);
    }
  }

  // 최근 100건만(감사3 #19) — desc로 뽑은 뒤 원래 순서(오름차순)로 되돌린다.
  const { data: msgsDesc } = await sb
    .from("chat_messages")
    .select("id, sender_type, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(100);
  const truncated = (msgsDesc ?? []).length === 100;
  const msgs = (msgsDesc ?? []).slice().reverse();

  // 이 회원의 읽음 지점 갱신(참여자별 — 2:1에서 상대 배지에 영향 없음).
  await sb
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("member_id", me.memberId);

  const messages: ChatMessageView[] = (msgs ?? []).map((m) => {
    const mine = m.sender_type === "member" && m.sender_id === me.memberId;
    const sender =
      isTeam && m.sender_type === "member" && !mine
        ? nameById.get(m.sender_id as string)
        : undefined;
    return {
      id: m.id as string,
      mine,
      sender,
      text: m.text as string,
      time: clockLabel(m.created_at as string),
      createdAt: m.created_at as string,
    };
  });

  const cursor =
    msgs && msgs.length ? (msgs[msgs.length - 1].created_at as string) : null;

  return {
    trainerName,
    initial,
    sub: isTeam ? "2:1 팀 채팅" : "담당 선생님",
    isTeam,
    messages,
    cursor,
    truncated,
  };
}

/** New messages in the member's thread at/after `sinceISO` (or all if null), marking incoming as read. */
export async function loadNewMemberMessages(
  sinceISO: string | null
): Promise<ChatMessageView[]> {
  const me = await getMemberContext();
  if (!me) return [];

  // Resolve the SAME canonical thread the room uses (avoids divergence from stale threads).
  const threadId = await ensureChatThread(me.memberId);
  if (!threadId) return [];
  const { data: threadRow } = await sb
    .from("chat_threads")
    .select("type")
    .eq("id", threadId)
    .maybeSingle();
  const isTeam = threadRow?.type === "2on1";

  // Participant names, for labeling a 2:1 partner's messages.
  const nameById = new Map<string, string>();
  if (isTeam) {
    const { data: parts } = await sb
      .from("chat_participants")
      .select("member_id, members(name)")
      .eq("thread_id", threadId);
    for (const p of (parts ?? []) as unknown as {
      member_id: string;
      members: { name: string } | null;
    }[]) {
      if (p.members?.name) nameById.set(p.member_id, p.members.name);
    }
  }

  let q = sb
    .from("chat_messages")
    .select("id, sender_type, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { data: msgs, error: qErr } = await q;
  if (qErr) return [];

  await sb
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("member_id", me.memberId);

  return (msgs ?? []).map((m) => {
    const mine = m.sender_type === "member" && m.sender_id === me.memberId;
    const sender =
      isTeam && m.sender_type === "member" && !mine
        ? nameById.get(m.sender_id as string)
        : undefined;
    return {
      id: m.id as string,
      mine,
      sender,
      text: m.text as string,
      time: clockLabel(m.created_at as string),
      createdAt: m.created_at as string,
    } satisfies ChatMessageView;
  });
}

/* ----------------------------- tab badge ----------------------------- */
/** Member's unread = count of trainer messages not yet read by this member, in their canonical thread. */
export async function getMemberChatUnread(): Promise<number> {
  const me = await getMemberContext();
  if (!me) return 0;
  // 회원 채팅방은 canonical 스레드 하나만 열린다 — 담당/유형 변경으로 남은 옛 스레드의 메시지를
  // 세면 끌 수 없는 유령 배지가 된다(감사3 #15).
  const threadId = await ensureChatThread(me.memberId);
  if (!threadId) return 0;
  const { data: cp } = await sb
    .from("chat_participants")
    .select("last_read_at")
    .eq("thread_id", threadId)
    .eq("member_id", me.memberId)
    .maybeSingle();
  let q = sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("sender_id", me.memberId);
  if (cp?.last_read_at) q = q.gt("created_at", cp.last_read_at as string);
  const { count } = await q;
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

/**
 * Notification toggles, grouped. `ready` marks whether a generator actually delivers it —
 * only 만료/잔여 are wired (notifications.ts). Unready items render as "준비 중" (no live toggle),
 * so the screen never pretends to control something it can't.
 */
const NOTIF_GROUPS: { title: string; items: { key: string; title: string; sub: string; def: boolean; ready: boolean }[] }[] = [
  {
    title: "회원권",
    items: [
      { key: "expiry_soon", title: "만료 임박 안내", sub: "유효기간 D-7부터 안내", def: true, ready: true },
      { key: "low_sessions", title: "잔여 횟수 소진 임박", sub: "3회 이하로 남으면 알림", def: true, ready: true },
    ],
  },
  {
    title: "수업 알림",
    items: [
      { key: "class_status", title: "예약 확정·취소", sub: "예약 상태가 바뀌면 알려드려요", def: true, ready: false },
      { key: "class_reminder", title: "수업 1시간 전 리마인더", sub: "놓치지 않도록 미리 알림", def: true, ready: false },
      { key: "attend_deduct", title: "출석·차감 알림", sub: "수업 후 잔여 횟수를 확인", def: false, ready: false },
    ],
  },
  {
    title: "마케팅",
    items: [
      { key: "events", title: "이벤트·혜택 소식", sub: "할인·프로모션 안내", def: false, ready: false },
      { key: "night_push", title: "야간 푸시 (21–8시)", sub: "늦은 시간 알림 받기", def: false, ready: false },
    ],
  },
];

/** Valid notification keys (for action-side validation). */
export const NOTIF_KEYS = NOTIF_GROUPS.flatMap((g) => g.items.map((i) => i.key));
/** Keys whose toggle is actually honored by a generator. */
export const NOTIF_READY_KEYS = NOTIF_GROUPS.flatMap((g) => g.items.filter((i) => i.ready).map((i) => i.key));

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

/** 활성 공지 id 목록(최신순). 회원 읽음 배지/목록의 DB 소스. */
async function activeNoticeIds(): Promise<string[]> {
  const { data } = await sb.from("notices").select("id").eq("active", true);
  return (data ?? []).map((n) => n.id as string);
}

function unreadNoticeCount(noticeIds: string[], readIds: string[]): number {
  return noticeIds.filter((id) => !readIds.includes(id)).length;
}

/** Per-member notification prefs (DB-backed, so the background scan can honor them). */
export async function readMemberNotifPrefs(memberId: string): Promise<Record<string, boolean>> {
  const { data } = await sb.from("members").select("notif_prefs").eq("id", memberId).maybeSingle();
  const p = data?.notif_prefs as unknown;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, boolean>) : {};
}

/** Number of sessions this member actually attended (누적 출석). Count-only (no row transfer). */
async function attendedCount(memberId: string): Promise<number> {
  const { count } = await sb
    .from("session_members")
    .select("sessions!inner(status)", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("sessions.status", "attended");
  return count ?? 0;
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

  const [mrow, membership, tr, attended, firstStart, readIds, noticeIds] = await Promise.all([
    sb.from("members").select("name, status, avatar_tone").eq("id", me.memberId).maybeSingle(),
    activeMembership(me.memberId),
    primaryTrainer(me.memberId),
    attendedCount(me.memberId),
    earliestMembershipStart(me.memberId),
    readNoticeReadIds(),
    activeNoticeIds(),
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
    const paused = membership.status === "paused";
    membershipView = {
      productLabel: `1:1 PT ${total}회권`,
      remaining,
      total,
      dDay,
      endLabel: String(membership.end_date).replace(/-/g, "."),
      barPct: total > 0 ? Math.round((remaining / total) * 100) : 0,
      expired: membership.status === "expired" || (dDay < 0 && !paused),
      paused,
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
      { value: String(unreadNoticeCount(noticeIds, readIds)), unit: "건", label: "미열람 공지" },
    ],
    membership: membershipView,
    trainer: tr ? { name: tr.display_name, sub: "담당 선생님" } : null,
    unreadNotices: unreadNoticeCount(noticeIds, readIds),
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

  // 결제 당시의 결제자(payer_member_id) 기준 — 회원권 양도 후에도 원 결제자에게 결제내역이 남는다(감사3 #14).
  // 현재 회원권 소유 여부와 무관 → memberships 목록이 아니라 payments를 먼저 조회.
  const { data: pays } = await sb
    .from("payments")
    .select("id, membership_id, method, amount, paid_at")
    .eq("payer_member_id", me.memberId)
    .order("paid_at", { ascending: false });
  const payments = pays ?? [];
  if (!payments.length) return { totalAmount: 0, totalCount: 0, years: [] };

  // 라벨용(상품명·상태) memberships는 결제 행들이 가리키는 membership_id 집합으로 역조회.
  const membershipIds = [...new Set(payments.map((p) => p.membership_id).filter((id): id is string => !!id))];
  const { data: ms } = membershipIds.length
    ? await sb.from("memberships").select("id, total_sessions, status").in("id", membershipIds)
    : { data: [] as { id: string; total_sessions: number; status: string }[] };
  const byId = new Map((ms ?? []).map((m) => [m.id, m]));

  // Status label by membership state (positive rows) — refund rows (amount<0) are tagged separately.
  const MEMBERSHIP_PAYMENT_STATUS: Record<string, string> = {
    active: "결제완료",
    refunded: "환불됨",
    paused: "일시정지",
    expired: "사용완료",
    used: "사용완료",
  };

  let totalAmount = 0;
  const items: (MemberPaymentItem & { paidAt: string })[] = payments.map((p) => {
    const m = byId.get(p.membership_id);
    const total = m?.total_sessions ?? 0;
    const mm = String(p.paid_at).slice(5, 7);
    const dd = String(p.paid_at).slice(8, 10);
    if (typeof p.amount === "number") totalAmount += p.amount;
    const isRefund = typeof p.amount === "number" && p.amount < 0;
    const status = m?.status ?? "active";
    const done = !isRefund && status === "active";
    return {
      id: p.id,
      productLabel: `1:1 PT ${total}회권`,
      dateLabel: `${mm}.${dd} · ${isRefund ? "환불" : PAYMENT_METHOD_LABEL[p.method] ?? "결제"}`,
      amount: p.amount ?? null,
      statusLabel: isRefund ? "환불" : MEMBERSHIP_PAYMENT_STATUS[status] ?? "사용완료",
      done,
      refund: isRefund,
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
  // 건수는 "결제 건"만(환불행 제외) — 헤더/연도 카운트 일관.
  const years: MemberPaymentYear[] = [...yearMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, list]) => ({ year, count: list.filter((it) => !it.refund).length, items: list }));
  const totalCount = items.filter((it) => !it.refund).length;

  return { totalAmount, totalCount, years };
}

/* ----------------------------- 운동 기록 (/m/my/records) ----------------------------- */
/** Workout records the trainer logged for this member (read-only, newest first). */
export async function getMemberWorkoutRecords(): Promise<MemberWorkoutView> {
  const me = await requireMember();
  const { data } = await sb
    .from("workout_records")
    .select("id, exercises, comment, created_at, sessions(scheduled_at)")
    .eq("member_id", me.memberId)
    .order("created_at", { ascending: false })
    .limit(50);

  const records: MemberWorkoutRecord[] = (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      exercises: unknown;
      comment: string | null;
      created_at: string;
      sessions?: { scheduled_at: string } | null;
    };
    const when = row.sessions?.scheduled_at ?? row.created_at;
    const dISO = kstDateISO(when);
    const dateLabel = `${Number(dISO.slice(5, 7))}월 ${Number(dISO.slice(8, 10))}일 ${weekdayKo(kstWeekday(when))}`;
    const exercises = parseExercises(row.exercises);
    return {
      id: row.id,
      dateLabel,
      timeLabel: clockLabel(when),
      exercises,
      comment: row.comment ?? undefined,
    };
  });
  return { records };
}

/* ----------------------------- A3 · 공지사항 ----------------------------- */
export async function getMemberNotices(): Promise<MemberNoticesView> {
  await requireMember();
  const readIds = await readNoticeReadIds();
  const { data } = await sb
    .from("notices")
    .select("id, tag, tone, title, body, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(50);
  const notices: MemberNotice[] = (data ?? []).map((n) => ({
    id: n.id as string,
    tag: n.tag as string,
    tone: n.tone as MemberNotice["tone"],
    dateLabel: kstDateISO(n.created_at as string).slice(5).replace("-", "."),
    title: n.title as string,
    body: (n.body as string | null) ?? "",
    unread: !readIds.includes(n.id as string),
  }));
  return { notices, unread: notices.filter((n) => n.unread).length };
}

/* ----------------------------- A4 · 알림 설정 ----------------------------- */
export async function getMemberNotifSettings(): Promise<MemberNotifView> {
  const me = await requireMember();
  const overrides = await readMemberNotifPrefs(me.memberId);
  return {
    groups: NOTIF_GROUPS.map((g) => ({
      title: g.title,
      items: g.items.map((it) => ({
        key: it.key,
        title: it.title,
        sub: it.sub,
        ready: it.ready,
        on: typeof overrides[it.key] === "boolean" ? overrides[it.key] : it.def,
      })),
    })),
  };
}
