// Mock repository — assembles view models from seed for UI-first development.
// View shapes match src/lib/types.ts; P3 swaps these for Supabase queries.

import type {
  AttendTarget,
  AvatarTone,
  BadgeView,
  CalendarDay,
  ChatRoomView,
  ChatThreadView,
  ConfirmView,
  InboxView,
  Me,
  MemberCalendarView,
  MemberDetailView,
  MemberFilter,
  MemberReceiveView,
  MemberRequestView,
  MembersView,
  MembershipProduct,
  PerfSummary,
  RetentionView,
  SentItem,
  StaffMember,
  TrainerCalendarView,
  TrainerDayClass,
} from "@/lib/types";
import {
  CAL_DOTS,
  DAYS_IN_MONTH,
  DEFAULT_EXERCISES,
  FIRST_WEEKDAY,
  MEMBERS,
  MEMBERSHIP_PRODUCTS,
  MEMBER_VIEWER_ID,
  ME_TRAINER,
  MONTH_LABEL,
  PERF,
  RECEIVED_REQUESTS,
  REST_COUNT,
  SELECTED_DAY,
  SENT_REQUESTS,
  STAFF,
  TOTAL_MEMBERS,
  type SeedMember,
} from "./seed";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function hourLabel(h: number): string {
  if (h < 12) return `오전 ${h}:00`;
  if (h === 12) return "오후 12:00";
  return `오후 ${h - 12}:00`;
}
function weekdayOf(day: number): number {
  return (FIRST_WEEKDAY + day - 1) % 7;
}
function dateISO(day: number): string {
  return `2026-06-${String(day).padStart(2, "0")}`;
}
function dayFromISO(iso?: string): number {
  if (!iso) return SELECTED_DAY;
  const d = Number(iso.slice(-2));
  return Number.isFinite(d) && d >= 1 && d <= DAYS_IN_MONTH ? d : SELECTED_DAY;
}
function fullDateLabel(day: number): string {
  return `6월 ${day}일 ${WD[weekdayOf(day)]}요일`;
}
function shortDateLabel(day: number): string {
  return `6월 ${day}일 ${WD[weekdayOf(day)]}`;
}

function buildCalDays(dots: Set<number>, selected: number): CalendarDay[] {
  return Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
    const n = i + 1;
    return {
      n,
      dateISO: dateISO(n),
      inMonth: true,
      isSunday: weekdayOf(n) === 0,
      hasDot: dots.has(n),
      selected: n === selected,
    };
  });
}

function findMember(id: string): SeedMember {
  return MEMBERS.find((m) => m.id === id) ?? MEMBERS[2];
}
/** mock session ids encode the member: "s_<memberKey>". */
function memberFromSession(sessionId: string): SeedMember {
  const key = sessionId.replace(/^s_/, "");
  return MEMBERS.find((m) => m.id === `m_${key}` || m.id === key) ?? findMember("m_iji");
}

const BAR = {
  "1on1": "#768c6a",
  "2on1": "#6e8aa0",
  attended: "#8fa187",
  cancelled: "#c2baad",
} as const;

function dayClassesFor(day: number): TrainerDayClass[] {
  const wd = weekdayOf(day);
  return MEMBERS.filter((m) => m.weekdays.includes(wd)).map((m) => {
    const isTeam = m.type === "2on1";
    const sessionId = `s_${m.id.replace(/^m_/, "")}`;
    const isIji = m.id === "m_iji";
    return {
      sessionId,
      time: hourLabel(m.hour),
      name: m.name,
      type: m.type,
      status: "scheduled",
      barColor: isTeam ? BAR["2on1"] : BAR["1on1"],
      showAttend: !isIji,
      badge: isIji
        ? { text: "예정", variant: "scheduled" }
        : isTeam
          ? { text: "2:1", variant: "team" }
          : undefined,
      href: isIji ? `/t/class/${sessionId}` : `/t/attend/${sessionId}`,
    } satisfies TrainerDayClass;
  });
}

/* ------------------------------- me ------------------------------- */
export function getMe(): Me {
  return {
    role: "owner",
    name: ME_TRAINER.name,
    roleLabel: ME_TRAINER.roleLabel,
    trainerRole: "owner",
    isOwner: true,
    trainerId: ME_TRAINER.trainerId,
  };
}

/* --------------------------- trainer calendar --------------------------- */
export function getTrainerCalendar(iso?: string): TrainerCalendarView {
  const day = dayFromISO(iso);
  return {
    meName: ME_TRAINER.name,
    meRole: ME_TRAINER.roleLabel,
    todayLabel: fullDateLabel(SELECTED_DAY),
    expiringCount: MEMBERS.filter((m) => m.status === "expiring").length,
    inboxCount: RECEIVED_REQUESTS.length,
    hasInbox: RECEIVED_REQUESTS.length > 0,
    monthLabel: MONTH_LABEL,
    calDays: buildCalDays(CAL_DOTS, day),
    selDateLabel: shortDateLabel(day),
    dayClasses: dayClassesFor(day),
  };
}

/* ------------------------------ members ------------------------------ */
function badgeForMember(m: SeedMember): BadgeView {
  if (m.status === "expiring") {
    const variant: BadgeView["variant"] = m.dDay <= 5 ? "expiringNear" : "expiringSoon";
    return { text: `D-${m.dDay}`, variant };
  }
  return { text: "활성", variant: "active" };
}
function memberSub(m: SeedMember): string {
  const days = m.weekdays.map((w) => WD[w]).join("·");
  const kind = m.type === "2on1" ? "2:1" : "1:1";
  return `${kind} · ${days} ${hourLabel(m.hour).replace("오후 ", "오후 ").replace("오전 ", "오전 ")} · 잔여 ${m.remaining}회`;
}

export function getMembers(filter: MemberFilter = "all"): MembersView {
  const expiring = MEMBERS.filter((m) => m.status === "expiring");
  const active = MEMBERS.filter((m) => m.status === "active");
  let pool: SeedMember[];
  if (filter === "expiring") pool = expiring;
  else if (filter === "active") pool = active;
  else if (filter === "rest") pool = [];
  else pool = MEMBERS;

  return {
    totals: { total: TOTAL_MEMBERS, expiring: expiring.length, rest: REST_COUNT },
    filter,
    items: pool.map((m) => ({
      id: m.id,
      name: m.name,
      initial: m.initial,
      avatarTone: m.avatarTone,
      isTeam: m.type === "2on1",
      team: m.team,
      sub: memberSub(m),
      badge: badgeForMember(m),
    })),
  };
}

export function getMemberDetail(id: string): MemberDetailView {
  const m = findMember(id);
  const barPct = Math.round((m.remaining / m.total) * 100);
  return {
    id: m.id,
    name: m.name,
    isTeam: m.type === "2on1",
    team: m.team,
    initial: m.initial,
    avatarTone: m.avatarTone,
    badge: badgeForMember(m),
    typeLabel: m.type === "2on1" ? "2:1 PT" : "1:1 PT",
    product: m.product,
    remaining: m.remaining,
    total: m.total,
    dDay: m.dDay,
    startDate: m.startDate,
    endDate: m.endDate,
    barPct,
    body: m.body,
    schedule: m.scheduleLabel,
    injury: m.injury,
  };
}

/* ------------------------------ perf ------------------------------ */
export function getPerf(): PerfSummary {
  return {
    monthLabel: PERF.monthLabel,
    revenue: PERF.revenue,
    revenueDelta: PERF.revenueDelta,
    classCount: PERF.classCount,
    memberCount: PERF.memberCount,
    attendRate: PERF.attendRate,
    weeklyBars: PERF.weeklyBars,
    expiringCount: MEMBERS.filter((m) => m.status === "expiring").length,
    expectedRevenue: PERF.expectedRevenue,
  };
}

/* --------------------------- attend / record --------------------------- */
export function getAttendTarget(sessionId: string): AttendTarget {
  const m = memberFromSession(sessionId);
  const isTeam = m.type === "2on1";
  return {
    sessionId,
    name: m.name,
    initial: m.initial,
    avatarTone: m.avatarTone,
    isTeam,
    team: m.team,
    meta: `${isTeam ? "2:1 PT" : "1:1 PT"} · ${hourLabel(m.hour)} · 잔여 ${m.remaining}회`,
    type: m.type,
    remaining: m.remaining,
  };
}

export function getRecordTarget(sessionId: string) {
  const m = memberFromSession(sessionId);
  return {
    sessionId,
    memberId: m.id,
    name: m.name,
    initial: m.initial,
    avatarTone: m.avatarTone,
    dateLabel: `6월 ${SELECTED_DAY}일 · ${m.type === "2on1" ? "2:1" : "1:1"} PT`,
    exercises: DEFAULT_EXERCISES.map((e) => ({ ...e })),
  };
}

/* ----------------------------- retention ----------------------------- */
export function getRetention(): RetentionView {
  const expiring = MEMBERS.filter((m) => m.status === "expiring");
  return {
    expiringCount: expiring.length,
    expectedRevenue: PERF.expectedRevenue,
    items: expiring.map((m) => ({
      memberId: m.id,
      name: m.name,
      initial: m.initial,
      avatarTone: m.avatarTone,
      remaining: m.remaining,
      dDay: m.dDay,
      guided: !!m.guided,
    })),
    pendingCount: expiring.filter((m) => !m.guided).length,
  };
}

/* ------------------------------ inbox ------------------------------ */
export function getInbox(): InboxView {
  return {
    receivedCount: RECEIVED_REQUESTS.length,
    sentCount: SENT_REQUESTS.length,
    received: RECEIVED_REQUESTS.map((r) => {
      const m = findMember(r.memberId);
      return {
        id: r.id,
        name: m.name,
        initial: m.initial,
        avatarTone: m.avatarTone,
        ago: r.ago,
        type: r.type,
        before: r.before,
        after: r.after,
        reason: r.reason,
      };
    }),
    sent: SENT_REQUESTS.map<SentItem>((s) => {
      const m = findMember(s.memberId);
      return { id: s.id, name: m.name, summary: s.summary, status: s.status };
    }),
  };
}

export function getConfirm(): ConfirmView {
  return { before: "6/21 토 · 오후 7:00", after: "6/22 일 · 오후 7:00", remainingKept: 3 };
}

/* ------------------------------ staff ------------------------------ */
export function getStaff(): StaffMember[] {
  return STAFF.map((s) => ({
    id: s.id,
    name: s.name,
    initial: s.initial,
    avatarTone: s.avatarTone,
    role: s.role,
    sub:
      s.role === "owner"
        ? `대표 · 나 · 담당 ${s.count}명`
        : s.role === "instructor"
          ? `강사 · 담당 ${s.count}명`
          : "초대 대기 · 계정 미설정",
    isMe: s.isMe,
  }));
}

export function getMembershipProducts(): MembershipProduct[] {
  return MEMBERSHIP_PRODUCTS.map((p) => ({ ...p }));
}

/* ------------------------------ chat ------------------------------ */
export function getChatThreads(): ChatThreadView[] {
  const tone = (id: string): AvatarTone => findMember(id).avatarTone;
  return [
    {
      id: "ch_iji",
      name: "이지수",
      initial: "이",
      avatarTone: tone("m_iji"),
      isTeam: false,
      preview: "네 알겠습니다! 토요일에 봬요",
      time: "오후 2:14",
      unread: 2,
    },
    {
      id: "ch_team",
      name: "윤지아·강민",
      initial: "윤",
      avatarTone: "sage",
      isTeam: true,
      team: findMember("m_team").team,
      preview: "윤지아: 다음 주 시간 조정 가능할까요?",
      time: "오전 11:30",
      unread: 1,
    },
    {
      id: "ch_park",
      name: "박서연",
      initial: "박",
      avatarTone: tone("m_park"),
      isTeam: false,
      preview: "나: 운동 기록 올려두었어요",
      time: "어제",
      unread: 0,
    },
    {
      id: "ch_jung",
      name: "정민호",
      initial: "정",
      avatarTone: tone("m_jung"),
      isTeam: false,
      preview: "감사합니다 코치님",
      time: "어제",
      unread: 0,
    },
  ];
}

export function getChatUnread(): number {
  return getChatThreads().reduce((s, t) => s + t.unread, 0);
}

export function getChatRoom(id: string): ChatRoomView {
  if (id === "ch_team") {
    const team = findMember("m_team").team;
    return {
      threadId: id,
      name: "윤지아·강민",
      isTeam: true,
      team,
      initial: "윤",
      avatarTone: "sage",
      sub: "2:1 PT · 매주 화·토 오후 8시",
      messages: [
        { id: "1", mine: false, sender: "윤지아", text: "코치님 다음 주 시간 조정 가능할까요?", time: "오전 11:28" },
        { id: "2", mine: false, sender: "강민", text: "저도 화요일은 괜찮습니다", time: "오전 11:29" },
        { id: "3", mine: true, text: "네 화요일 8시로 옮겨드릴게요. 일정 변경 보내드립니다.", time: "오전 11:30" },
      ],
    };
  }
  const key = id.replace(/^ch_/, "m_");
  const m = findMember(key);
  return {
    threadId: id,
    name: m.name,
    isTeam: false,
    initial: m.initial,
    avatarTone: m.avatarTone,
    sub: `${m.type === "2on1" ? "2:1" : "1:1"} PT · ${m.scheduleLabel}`,
    messages: [
      { id: "1", mine: true, text: "오늘 수업 고생하셨어요! 다음 시간엔 하체 위주로 가볼게요.", time: "오후 1:50" },
      { id: "2", mine: false, text: "넵 감사합니다 코치님", time: "오후 2:10" },
      { id: "3", mine: false, text: "네 알겠습니다! 토요일에 봬요", time: "오후 2:14" },
    ],
  };
}

/* --------------------------- member app --------------------------- */
export function getMemberCalendar(iso?: string): MemberCalendarView {
  const m = findMember(MEMBER_VIEWER_ID);
  const day = dayFromISO(iso);
  const dots = new Set<number>();
  for (let n = 1; n <= DAYS_IN_MONTH; n++) if (m.weekdays.includes(weekdayOf(n))) dots.add(n);
  const wd = weekdayOf(day);
  const hasClass = m.weekdays.includes(wd) || day === SELECTED_DAY;
  return {
    name: m.name,
    remaining: m.remaining,
    dDay: m.dDay,
    hasTrainerReq: true,
    monthLabel: MONTH_LABEL,
    calDays: buildCalDays(dots, day),
    selDateLabel: shortDateLabel(day),
    scheduleLegend: `정기 수업 ${m.scheduleLabel.replace("매주 ", "매주 ")}`,
    dayClass: hasClass
      ? { sessionId: "s_iji", time: hourLabel(m.hour), trainerName: ME_TRAINER.name }
      : undefined,
  };
}

export function getMemberReceive(): MemberReceiveView {
  return {
    trainerName: ME_TRAINER.name,
    ago: "10분 전",
    before: "6/21 토 · 오후 7:00",
    reason: "트레이너 개인 일정",
    slots: [
      { id: "r1", label: "6/22 일 · 오후 7:00" },
      { id: "r2", label: "6/23 월 · 오후 8:00" },
    ],
  };
}

export function getMemberRequest(): MemberRequestView {
  return {
    sessionId: "s_iji",
    dateBox: { weekday: "토", day: 21 },
    time: "오후 7:00",
    trainerName: ME_TRAINER.name,
    slots: [
      { id: "a", label: "6/22 일 · 오후 7:00" },
      { id: "b", label: "6/24 화 · 오후 7:00" },
    ],
  };
}

export function getProposeSlots() {
  return {
    before: "6/21 토 · 오후 7:00",
    memberName: "이지수",
    slots: [
      { id: "p1", label: "6/22 일 · 오후 7:00" },
      { id: "p2", label: "6/23 월 · 오후 8:00" },
      { id: "p3", label: "6/24 화 · 오후 7:00" },
      { id: "p4", label: "6/25 수 · 오후 7:00" },
    ],
    reasons: ["개인 일정", "시설 점검", "직접 입력"],
  };
}

export function getClassDetail(sessionId: string) {
  const m = memberFromSession(sessionId);
  return {
    sessionId,
    name: m.name,
    initial: m.initial,
    avatarTone: m.avatarTone,
    isTeam: m.type === "2on1",
    team: m.team,
    typeLabel: `${m.type === "2on1" ? "2:1" : "1:1"} PT · 잔여 ${m.remaining}회`,
    dateLabel: "6월 21일 토 · 오후 7:00–8:00",
  };
}
