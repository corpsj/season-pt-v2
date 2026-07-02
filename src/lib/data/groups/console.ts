import "server-only";
import {
  sb,
  kstDateISO,
  clockHM,
  todayISO,
  dayDiff,
  nowKstParts,
  monthBoundsKst,
  weekBoundsKst,
  weekdayKo,
  kstWeekday,
} from "@/lib/data/db";
import type { AvatarTone, RequestType, SessionStatus } from "@/lib/types";

function asTone(t: string | null | undefined): AvatarTone {
  const tones: AvatarTone[] = ["sage", "sageMid", "sageSoft", "gold", "pending", "terracotta"];
  return tones.includes(t as AvatarTone) ? (t as AvatarTone) : "sage";
}

function slotLabel(iso: string): string {
  const d = kstDateISO(iso);
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${weekdayKo(kstWeekday(iso))}) ${clockHM(iso)}`;
}
function agoLabel(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/* ============================================================
   Console-only, studio-wide getters (대표 콘솔).
   The mobile getTrainerCalendar* filter to the logged-in trainer;
   the owner console shows EVERY trainer's classes with a filter,
   so these read sessions studio-wide (joined to trainer + members).
   ============================================================ */

/** Stable per-trainer colors for calendar chips + 강사 실적 bars. */
export const TRAINER_PALETTE = ["#768c6a", "#6e8aa0", "#b89a5e", "#a06b4e", "#9a8c72", "#5c7286"];
export function trainerColor(index: number): string {
  return TRAINER_PALETTE[index % TRAINER_PALETTE.length];
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "예정",
  attended: "출석",
  noshow: "노쇼",
  cancelled: "취소",
};

export interface StudioClass {
  sessionId: string;
  start: string; // "오후 7:00"
  end: string; // "오후 8:00"
  member: string; // "이지수" or "이지수·최유나"
  initial: string;
  trainerId: string;
  trainerName: string;
  color: string;
  status: SessionStatus;
  statusLabel: string;
  isTeam: boolean;
  showAttend: boolean;
  scheduledAt: string;
  signed: boolean; // 수업 완료 회원 확인 서명 존재 여부(이미지는 온디맨드 로드)
}

type SessRow = {
  id: string;
  scheduled_at: string;
  type: "1on1" | "2on1";
  status: SessionStatus;
  trainer_id: string;
  signed_at: string | null;
  trainers: { display_name: string } | null;
  session_members: { members: { name: string; avatar_tone: string } | null }[];
};

const SELECT =
  "id, scheduled_at, type, status, trainer_id, signed_at, trainers(display_name), session_members(members(name, avatar_tone))";

function plusHour(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString();
}

function mapClass(s: SessRow, colorByTrainer: Map<string, string>, today: string): StudioClass {
  const names = s.session_members.map((sm) => sm.members?.name ?? "").filter(Boolean);
  const member = names.join("·") || "회원";
  const sessionISO = kstDateISO(s.scheduled_at);
  return {
    sessionId: s.id,
    start: clockHM(s.scheduled_at),
    end: clockHM(plusHour(s.scheduled_at)),
    member,
    initial: member.slice(0, 1),
    trainerId: s.trainer_id,
    trainerName: s.trainers?.display_name ?? "",
    color: colorByTrainer.get(s.trainer_id) ?? TRAINER_PALETTE[0],
    status: s.status,
    statusLabel: STATUS_LABEL[s.status],
    isTeam: s.type === "2on1",
    showAttend: s.status === "scheduled" && dayDiff(sessionISO, today) >= 0,
    scheduledAt: s.scheduled_at,
    signed: !!s.signed_at,
  };
}

/** Active-trainer → color map, in stable created order (for chips + bars). */
async function colorMap(): Promise<{ map: Map<string, string>; trainers: { id: string; name: string; color: string }[] }> {
  const { data } = await sb
    .from("trainers")
    .select("id, display_name, status")
    .order("created_at", { ascending: true });
  const map = new Map<string, string>();
  const trainers: { id: string; name: string; color: string }[] = [];
  (data ?? []).forEach((t, i) => {
    const color = trainerColor(i);
    map.set(t.id, color);
    trainers.push({ id: t.id, name: t.display_name, color });
  });
  return { map, trainers };
}

/* ----------------------------- dashboard: today ----------------------------- */
export async function getStudioToday(): Promise<{
  total: number;
  attended: number;
  scheduled: number;
  noshow: number;
  classes: StudioClass[];
}> {
  const now = nowKstParts();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const d = now.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m0, d, -9, 0, 0)).toISOString();
  const endUtc = new Date(Date.UTC(y, m0, d + 1, -9, 0, 0)).toISOString();
  const today = todayISO();

  const [{ map }, { data: rows }] = await Promise.all([
    colorMap(),
    sb
      .from("sessions")
      .select(SELECT)
      .gte("scheduled_at", startUtc)
      .lt("scheduled_at", endUtc)
      .order("scheduled_at", { ascending: true }),
  ]);
  const classes = ((rows ?? []) as unknown as SessRow[]).map((s) => mapClass(s, map, today));
  const live = classes.filter((c) => c.status !== "cancelled");
  return {
    total: live.length,
    attended: live.filter((c) => c.status === "attended").length,
    scheduled: live.filter((c) => c.status === "scheduled").length,
    noshow: live.filter((c) => c.status === "noshow").length,
    classes,
  };
}

/* ----------------------------- calendar: month ----------------------------- */
export interface CalendarCell {
  date: number | null;
  dateISO: string;
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  count: number;
}
export interface StudioCalendarMonth {
  monthLabel: string;
  monthTotal: number;
  offset: number;
  todayISO: string;
  weeks: CalendarCell[][];
  byDate: Record<string, StudioClass[]>;
  trainers: { id: string; name: string; color: string }[];
}

export async function getStudioCalendarMonth(offset = 0): Promise<StudioCalendarMonth> {
  const now = nowKstParts();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const y = base.getUTCFullYear();
  const m0 = base.getUTCMonth();
  const monthStartUtc = new Date(Date.UTC(y, m0, 1, -9, 0, 0)).toISOString();
  const monthEndUtc = new Date(Date.UTC(y, m0 + 1, 1, -9, 0, 0)).toISOString();
  const today = todayISO();

  const [{ map, trainers }, { data: rows }] = await Promise.all([
    colorMap(),
    sb
      .from("sessions")
      .select(SELECT)
      .gte("scheduled_at", monthStartUtc)
      .lt("scheduled_at", monthEndUtc)
      .order("scheduled_at", { ascending: true }),
  ]);

  const byDate: Record<string, StudioClass[]> = {};
  let monthTotal = 0;
  for (const s of (rows ?? []) as unknown as SessRow[]) {
    // 멤버 없는 세션(일정 변경 시 원래 슬롯에 남긴 cancelled 표식 등)은 실제 수업이 아니라 렌더 제외.
    if ((s.session_members?.length ?? 0) === 0) continue;
    const cls = mapClass(s, map, today);
    (byDate[kstDateISO(s.scheduled_at)] ??= []).push(cls);
    if (cls.status !== "cancelled") monthTotal += 1;
  }

  // Sun-first grid (일~토)
  const daysInMonth = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay(); // 0=Sun
  const lead = firstDow;
  const cells: CalendarCell[] = [];
  const blank = (): CalendarCell => ({ date: null, dateISO: "", isToday: false, isSunday: false, isSaturday: false, count: 0 });
  for (let i = 0; i < lead; i++) cells.push(blank());
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(Date.UTC(y, m0, d)).getUTCDay();
    cells.push({
      date: d,
      dateISO,
      isToday: dateISO === today,
      isSunday: dow === 0,
      isSaturday: dow === 6,
      count: (byDate[dateISO] ?? []).filter((c) => c.status !== "cancelled").length,
    });
  }
  while (cells.length % 7 !== 0) cells.push(blank());
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    monthLabel: `${y}년 ${m0 + 1}월`,
    monthTotal,
    offset,
    todayISO: today,
    weeks,
    byDate,
    trainers,
  };
}

/* ----------------------------- calendar: week (시간표) ----------------------------- */
export interface WeekDay {
  dateISO: string;
  dayNum: number;
  weekdayIdx: number; // 0=일 … 6=토
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
}
export interface WeekClass extends StudioClass {
  dayISO: string;
  startMin: number; // KST 자정 기준 분 (그리드 세로 위치)
  endMin: number;
  sub: string; // "8/10회"(활성 회원권 잔여/총) 또는 강사명 폴백
}
export interface StudioCalendarWeek {
  weekLabel: string; // "6월 15일 — 21일"
  offset: number;
  days: WeekDay[];
  classes: WeekClass[];
  byDate: Record<string, StudioClass[]>; // 날짜 모달 재사용
  hourStart: number;
  hourEnd: number;
  trainers: { id: string; name: string; color: string }[];
}

const WEEK_SELECT =
  "id, scheduled_at, type, status, trainer_id, signed_at, trainers(display_name), session_members(member_id, members(name, avatar_tone))";

export async function getStudioCalendarWeek(offset = 0): Promise<StudioCalendarWeek> {
  const now = nowKstParts();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const dow = now.getUTCDay(); // 0=일 … 6=토 (KST)
  const sun = now.getUTCDate() - dow + offset * 7; // 이번(±offset) 주 일요일의 '일(day)'
  const weekStartUtc = new Date(Date.UTC(y, m, sun, -9, 0, 0)).toISOString();
  const weekEndUtc = new Date(Date.UTC(y, m, sun + 7, -9, 0, 0)).toISOString();
  const today = todayISO();

  const [{ map, trainers }, { data: rows }] = await Promise.all([
    colorMap(),
    sb
      .from("sessions")
      .select(WEEK_SELECT)
      .gte("scheduled_at", weekStartUtc)
      .lt("scheduled_at", weekEndUtc)
      .order("scheduled_at", { ascending: true }),
  ]);

  type WRow = {
    id: string;
    scheduled_at: string;
    type: "1on1" | "2on1";
    status: SessionStatus;
    trainer_id: string;
    signed_at: string | null;
    trainers: { display_name: string } | null;
    session_members: { member_id: string; members: { name: string; avatar_tone: string } | null }[];
  };
  const rowList = (rows ?? []) as unknown as WRow[];

  // 활성 회원권 잔여/총 — 블록 서브라벨용(이미지의 "8/10회"). 한 번에 배치 조회.
  const memberIds = [...new Set(rowList.flatMap((r) => r.session_members.map((sm) => sm.member_id)).filter(Boolean))];
  const countByMember = new Map<string, string>();
  if (memberIds.length) {
    const { data: ms } = await sb
      .from("memberships")
      .select("member_id, remaining_sessions, total_sessions")
      .eq("status", "active")
      .in("member_id", memberIds);
    for (const r of (ms ?? []) as { member_id: string; remaining_sessions: number | null; total_sessions: number | null }[]) {
      if (!countByMember.has(r.member_id) && r.total_sessions != null) {
        countByMember.set(r.member_id, `${r.remaining_sessions ?? 0}/${r.total_sessions}회`);
      }
    }
  }

  const byDate: Record<string, StudioClass[]> = {};
  const classes: WeekClass[] = [];
  for (const r of rowList) {
    if ((r.session_members?.length ?? 0) === 0) continue; // 멤버 없는 tombstone 제외
    const cls = mapClass(r, map, today);
    const dayISO = kstDateISO(r.scheduled_at);
    (byDate[dayISO] ??= []).push(cls);
    const k = new Date(new Date(r.scheduled_at).getTime() + 9 * 3600 * 1000);
    const startMin = k.getUTCHours() * 60 + k.getUTCMinutes();
    const firstMid = r.session_members.map((sm) => sm.member_id).find(Boolean);
    const sub = (firstMid && countByMember.get(firstMid)) || cls.trainerName;
    classes.push({ ...cls, dayISO, startMin, endMin: startMin + 60, sub });
  }

  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m, sun + i));
    const dateISO = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    days.push({ dateISO, dayNum: dt.getUTCDate(), weekdayIdx: i, isToday: dateISO === today, isSunday: i === 0, isSaturday: i === 6 });
  }

  const startHours = classes.map((c) => Math.floor(c.startMin / 60));
  const endHours = classes.map((c) => Math.ceil(c.endMin / 60));
  const hourStart = Math.max(6, Math.min(9, ...startHours));
  const hourEnd = Math.min(23, Math.max(20, ...endHours));

  const s = days[0], e = days[6];
  const sM = Number(s.dateISO.slice(5, 7)), eM = Number(e.dateISO.slice(5, 7));
  const weekLabel = sM === eM ? `${sM}월 ${s.dayNum}일 — ${e.dayNum}일` : `${sM}월 ${s.dayNum}일 — ${eM}월 ${e.dayNum}일`;

  return { weekLabel, offset, days, classes, byDate, hourStart, hourEnd, trainers };
}

/* ----------------------------- dashboard: 강사 실적 ----------------------------- */
export interface TrainerPerf {
  id: string;
  name: string;
  color: string;
  sessions: number;
  pct: number; // 0-100 relative to the busiest trainer
}
export async function getTrainerPerf(): Promise<TrainerPerf[]> {
  const { startISO, endISO } = monthBoundsKst();
  const [{ trainers }, { data: sess }] = await Promise.all([
    colorMap(),
    sb
      .from("sessions")
      .select("trainer_id, status")
      .gte("scheduled_at", startISO)
      .lt("scheduled_at", endISO),
  ]);
  const counts = new Map<string, number>();
  for (const s of (sess ?? []) as { trainer_id: string; status: SessionStatus }[]) {
    if (s.status === "cancelled") continue;
    counts.set(s.trainer_id, (counts.get(s.trainer_id) ?? 0) + 1);
  }
  const max = Math.max(1, ...trainers.map((t) => counts.get(t.id) ?? 0));
  return trainers
    .map((t) => {
      const n = counts.get(t.id) ?? 0;
      return { id: t.id, name: t.name, color: t.color, sessions: n, pct: Math.round((n / max) * 100) };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/* ----------------------------- trainers: detail ----------------------------- */
export interface TrainerMemberRow {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  remaining: number;
  dDay: number | null;
  product: string;
}
export interface TrainerConsoleDetail {
  monthSessions: number;
  weekSessions: number;
  members: TrainerMemberRow[];
}

/** Owner console 강사 상세: this trainer's month/week class counts + assigned member list. */
export async function getTrainerConsoleDetail(trainerId: string): Promise<TrainerConsoleDetail> {
  const { startISO, endISO } = monthBoundsKst();
  const { startISO: wkS, endISO: wkE } = weekBoundsKst();
  const today = todayISO();

  const [monthRes, weekRes, linkRes] = await Promise.all([
    sb.from("sessions").select("id", { count: "exact", head: true }).eq("trainer_id", trainerId).neq("status", "cancelled").gte("scheduled_at", startISO).lt("scheduled_at", endISO),
    sb.from("sessions").select("id", { count: "exact", head: true }).eq("trainer_id", trainerId).neq("status", "cancelled").gte("scheduled_at", wkS).lt("scheduled_at", wkE),
    sb.from("member_trainers").select("member_id, members(id, name, avatar_tone)").eq("trainer_id", trainerId),
  ]);

  type Link = { member_id: string; members: { id: string; name: string; avatar_tone: string } | null };
  const links = (linkRes.data ?? []) as unknown as Link[];
  const memberIds = links.map((l) => l.member_id);

  const msBy = new Map<string, { product: string; remaining: number; dDay: number }>();
  if (memberIds.length) {
    const { data: ms } = await sb
      .from("memberships")
      .select("member_id, product, remaining_sessions, end_date")
      .eq("status", "active")
      .in("member_id", memberIds);
    for (const m of (ms ?? []) as { member_id: string; product: string; remaining_sessions: number; end_date: string }[]) {
      msBy.set(m.member_id, { product: `${m.product}회권`, remaining: m.remaining_sessions, dDay: dayDiff(today, m.end_date) });
    }
  }

  const members: TrainerMemberRow[] = links
    .filter((l) => l.members)
    .map((l) => {
      const mm = msBy.get(l.member_id);
      return {
        id: l.members!.id,
        name: l.members!.name,
        initial: l.members!.name.slice(0, 1),
        avatarTone: asTone(l.members!.avatar_tone),
        remaining: mm?.remaining ?? 0,
        dDay: mm ? mm.dDay : null,
        product: mm?.product ?? "회원권 없음",
      };
    });

  return { monthSessions: monthRes.count ?? 0, weekSessions: weekRes.count ?? 0, members };
}

/* ----------------------------- requests: studio-wide inbox ----------------------------- */
export interface StudioInboxItem {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  trainerName: string;
  ago: string;
  type: RequestType;
  before?: string;
  after?: string;
  reason?: string;
}
export interface StudioInboxDone {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  type: RequestType;
  status: "accepted" | "rejected";
}

/**
 * Studio-wide member→trainer schedule requests (getInbox is trainer-scoped). Owner sees
 * every pending request plus the most recent resolved ones, with the owning trainer's name.
 */
export async function getStudioInbox(): Promise<{ pending: StudioInboxItem[]; done: StudioInboxDone[] }> {
  // pending은 누락되면 owner가 처리를 못 하므로 cap 없이 전부, done만 최근 일부만 — 배지 수와도 일치.
  const cols = "id, session_id, type, status, reason, original_at, proposed_slots, created_at";
  const [{ data: pendingRows }, { data: doneRows }] = await Promise.all([
    sb.from("schedule_change_requests").select(cols).eq("requester_type", "member").eq("status", "pending").order("created_at", { ascending: false }),
    sb.from("schedule_change_requests").select(cols).eq("requester_type", "member").in("status", ["accepted", "rejected"]).order("created_at", { ascending: false }).limit(12),
  ]);
  const requests = ([...(pendingRows ?? []), ...(doneRows ?? [])]) as {
    id: string; session_id: string; type: RequestType; status: "pending" | "accepted" | "rejected";
    reason: string | null; original_at: string | null; proposed_slots: string[] | null; created_at: string;
  }[];
  if (!requests.length) return { pending: [], done: [] };

  const involved = Array.from(new Set(requests.map((r) => r.session_id)));
  const { data: sessRows } = await sb
    .from("sessions")
    .select("id, trainers(display_name), session_members(members(name, avatar_tone))")
    .in("id", involved);
  type SR = { id: string; trainers: { display_name: string } | null; session_members: { members: { name: string; avatar_tone: string } | null }[] };
  const byId = new Map<string, { trainerName: string; name: string; tone: string }>();
  for (const s of (sessRows ?? []) as unknown as SR[]) {
    const member = s.session_members.find((sm) => sm.members)?.members;
    byId.set(s.id, { trainerName: s.trainers?.display_name ?? "", name: member?.name ?? "", tone: member?.avatar_tone ?? "sage" });
  }

  const pending: StudioInboxItem[] = [];
  const done: StudioInboxDone[] = [];
  for (const r of requests) {
    const info = byId.get(r.session_id) ?? { trainerName: "", name: "", tone: "sage" };
    if (r.status === "pending") {
      pending.push({
        id: r.id,
        name: info.name,
        initial: info.name.slice(0, 1),
        avatarTone: asTone(info.tone),
        trainerName: info.trainerName,
        ago: agoLabel(r.created_at),
        type: r.type,
        before: r.original_at ? slotLabel(r.original_at) : undefined,
        after: r.type === "change" && r.proposed_slots?.length ? slotLabel(r.proposed_slots[0]) : undefined,
        reason: r.reason ?? undefined,
      });
    } else if (done.length < 8) {
      done.push({ id: r.id, name: info.name, initial: info.name.slice(0, 1), avatarTone: asTone(info.tone), type: r.type, status: r.status });
    }
  }
  return { pending, done };
}
