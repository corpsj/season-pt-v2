// Domain + view types — the contract shared by screens and data repositories
// (mock now, Supabase in P3). View-type shapes are FIXED so screens never change
// when repositories swap. Authority for fields: docs/DESIGN_SPEC.md §C/§E.

import type { IconName } from "@/components/ui/icon";

/* ----------------------------- enums ----------------------------- */
export type Role = "member" | "trainer" | "owner";
export type TrainerRole = "owner" | "instructor";
export type MemberStatus = "active" | "expiring" | "rest" | "inactive";
export type SessionType = "1on1" | "2on1";
export type SessionStatus = "scheduled" | "attended" | "noshow" | "cancelled";
export type AttendanceAction = "attend" | "noshow" | "cancel";
export type RequestType = "change" | "cancel";
export type RequestStatus = "pending" | "accepted" | "rejected";
export type PaymentMethod = "cash" | "card" | "account";
export type Gender = "female" | "male";

/** Avatar background tones (mapped to hex in the Avatar component). */
export type AvatarTone = "sage" | "sageMid" | "sageSoft" | "gold" | "pending" | "terracotta";

/** Badge/pill variants — full matrix from DESIGN_SPEC §B. */
export type BadgeVariant =
  | "active"
  | "expiringNear" // D-≤5
  | "expiringSoon" // D-6+
  | "changeReq"
  | "cancelReq"
  | "scheduled"
  | "team"
  | "done"
  | "cancelled"
  | "awaiting"
  | "owner"
  | "instructor"
  | "invited"
  | "remaining"
  | "recommended";

export type BannerTone = "neutral" | "warn" | "positive" | "team" | "owner";

/* --------------------------- domain rows --------------------------- */
export interface Trainer {
  id: string;
  username: string;
  displayName: string;
  role: TrainerRole;
  phone?: string;
  status: "active" | "invited" | "inactive";
  mustChangePassword?: boolean;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  birthdate: string; // YYYY-MM-DD
  gender?: Gender;
  status: MemberStatus;
  injuryNote?: string;
  avatarTone: AvatarTone;
}

export interface Membership {
  id: string;
  memberId: string;
  product: string;
  totalSessions: number;
  remainingSessions: number;
  startDate: string;
  endDate: string;
  price: number | null;
  status: "active" | "expired" | "refunded";
  guided: boolean;
}

export interface Session {
  id: string;
  trainerId: string;
  scheduledAt: string; // ISO datetime
  type: SessionType;
  status: SessionStatus;
  memberIds: string[]; // 1 (1on1) or 2 (2on1)
}

export interface WorkoutExercise {
  name: string;
  kg: number;
  sets: number;
}
export interface WorkoutRecord {
  id: string;
  sessionId: string;
  memberId: string;
  exercises: WorkoutExercise[];
  comment?: string;
}

export interface BodyComposition {
  weight: number;
  skeletalMuscle: number;
  bodyFat: number;
}

export interface ChangeRequest {
  id: string;
  sessionId: string;
  requesterType: "trainer" | "member";
  type: RequestType;
  status: RequestStatus;
  reason?: string;
  originalAt: string;
  proposedSlots: string[]; // ISO datetimes, <=3
  resolvedAt?: string;
}

export interface Payment {
  id: string;
  membershipId: string;
  method: PaymentMethod;
  amount: number | null;
  paidAt: string;
}

/* ------------------------------ me ------------------------------ */
export interface Me {
  role: Role;
  name: string;
  roleLabel: string; // "대표" | "트레이너" | "회원" etc.
  trainerRole?: TrainerRole;
  isOwner: boolean;
  memberId?: string;
  trainerId?: string;
}

/* --------------------------- view models --------------------------- */
export interface CalendarDay {
  n: number;
  dateISO: string;
  inMonth: boolean;
  isSunday: boolean;
  hasDot: boolean;
  /** 식단·운동·체형 기록이 있는 날(회원 캘린더 전용) — 미지정이면 표시 안 함 */
  hasRecordDot?: boolean;
  selected: boolean;
}

export interface TeamAvatar {
  init1: string;
  tone1: AvatarTone;
  init2: string;
  tone2: AvatarTone;
}

export interface BadgeView {
  text: string;
  variant: BadgeVariant;
}

export interface TrainerDayClass {
  sessionId: string;
  time: string; // "오후 7:00"
  name: string;
  type: SessionType;
  status: SessionStatus;
  barColor: string; // resolved hex
  showAttend: boolean;
  badge?: BadgeView;
  href: string; // navigation target
}

export interface TrainerCalendarView {
  meName: string;
  meRole: string;
  todayLabel: string;
  expiringCount: number;
  inboxCount: number;
  hasInbox: boolean;
  monthLabel: string;
  calDays: CalendarDay[];
  selDateLabel: string;
  dayClasses: TrainerDayClass[];
}

export interface MemberListItem {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  isTeam: boolean;
  team?: TeamAvatar;
  sub: string;
  badge: BadgeView;
}

export type MemberFilter = "all" | "expiring" | "active" | "rest";

export interface MembersView {
  totals: { total: number; expiring: number; rest: number };
  filter: MemberFilter;
  items: MemberListItem[];
}

export interface MemberDetailView {
  id: string;
  name: string;
  phone: string;
  gender: Gender | null;
  isTeam: boolean;
  team?: TeamAvatar;
  initial: string;
  avatarTone: AvatarTone;
  badge: BadgeView;
  typeLabel: string; // "1:1 PT"
  product: string; // "1:1 PT 20회권"
  remaining: number;
  total: number;
  dDay: number;
  startDate: string;
  endDate: string;
  barPct: number;
  body: BodyComposition;
  schedule: string;
  injury?: string;
  activeMembershipId: string | null;
  membershipPaused: boolean;
  memberStatus?: "active" | "rest" | "inactive"; // 회원 운영 상태(활성/휴면/비활성) — 대표 상태 전환 UI용
  events: { type: string; note: string | null; createdAt: string }[];
}

export interface PerfBar {
  label: string;
  valuePx: number;
  emphasized: boolean;
}
export interface StudioOverview {
  monthLabel: string;     // "2026년 6월"
  activeMembers: number;  // 가게 전체 활성 회원 수
  newThisMonth: number;   // 이번 달(KST) 신규 가입 회원 수
  weekClasses: number;    // 이번 주(월~토, KST) 수업 타임 수 — 전체 트레이너
  attendRate: number;     // 이번 달 전체 출석률 (%)
  trainerCount: number;   // 활성 트레이너 수 (status='active')
  weeklyBars: PerfBar[];  // 같은 이번 주(월~토) 수업의 요일별 분포 — 합 = weekClasses
  expiringCount: number;  // 14일 내 만료 임박 활성 회원권 수 — 전체
}
/** 대표 전용 운영(사업) 현황 — 이번 달 매출 + 재등록(들어올 돈) + 처리 대기. 스튜디오 전체. */
export interface StudioOps {
  monthLabel: string;             // "2026년 6월"
  revenueThisMonth: number;       // 이번 달(KST) 결제 합계 ₩
  paymentCount: number;           // 이번 달 결제 건수
  revenueDeltaPct: number | null; // 지난달 대비 % (지난달 0이면 null → 미표시)
  newMembers: number;             // 이번 달(KST) 신규 가입 회원 수
  expiringCount: number;          // D-14 이내 만료 임박 활성 회원 (전체)
  expectedRevenue: number;        // 재등록 임박 회원 예상 매출 합 ₩
  pendingRequests: number;        // 스튜디오 전체 미처리(회원 발신) 일정 변경/취소 요청 수
  activeMembers: number;          // 활성 회원권 보유 회원 수 (전체)
}
export interface PerfSummary {
  monthLabel: string;
  revenue: number;
  revenueDelta: number; // %
  classCount: number;
  memberCount: number;
  attendRate: number;
  weeklyBars: PerfBar[];
  expiringCount: number;
  expectedRevenue: number;
}

export interface AttendTarget {
  sessionId: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  isTeam: boolean;
  team?: TeamAvatar;
  meta: string; // "1:1 PT · 오후 7:00 · 잔여 3회"
  type: SessionType;
  remaining: number;
  balances: { name: string; remaining: number }[]; // 회원별 잔여 — 2:1 파트너 경고용(감사 #25)
  scheduledAt: string; // ISO — for deduction policy check
}

export interface RetentionItem {
  memberId: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  remaining: number;
  dDay: number;
  guided: boolean;
}
export interface RetentionView {
  expiringCount: number;
  expectedRevenue: number;
  items: RetentionItem[];
  pendingCount: number;
}

export interface InboxItem {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  ago: string;
  type: RequestType;
  before?: string;
  after?: string;
  reason?: string;
}
export interface SentItem {
  id: string;
  name: string;
  summary: string;
  status: "awaiting";
}
export interface InboxView {
  receivedCount: number;
  sentCount: number;
  received: InboxItem[];
  sent: SentItem[];
}

export interface ConfirmView {
  before: string;
  after: string;
  remainingKept: number;
}

export interface StaffMember {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  role: TrainerRole | "invited";
  sub: string;
  isMe: boolean;
}

export interface ChatThreadView {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  isTeam: boolean;
  team?: TeamAvatar;
  preview: string;
  time: string;
  unread: number;
}
export interface ChatMessageView {
  id: string;
  mine: boolean;
  sender?: string; // for 2:1 rooms
  text: string;
  time?: string;
  createdAt?: string; // raw ISO timestamp; absent on optimistic (temp) messages
}
export interface ChatRoomView {
  threadId: string;
  name: string;
  isTeam: boolean;
  team?: TeamAvatar;
  initial: string;
  avatarTone: AvatarTone;
  sub: string;
  messages: ChatMessageView[];
  cursor?: string | null; // newest message's created_at; initial poll cursor
  truncated?: boolean; // true when the initial load hit the 100-message cap(older history not shown)
}
/** A member a trainer can start a chat with (new-message picker). */
export interface ChatMemberPick {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
}

/* --------------------------- member app --------------------------- */
export interface MemberCalendarView {
  name: string;
  remaining: number;
  dDay: number;
  hasMembership: boolean; // false → 회원권 없음(배지 숨김)
  expired: boolean; // 만료일 지남 → 배지에 "만료" (paused면 false — 일시정지가 우선)
  paused: boolean; // 회원권 일시정지 중 → 배지에 "일시정지"
  hasTrainerReq: boolean;
  monthLabel: string;
  calDays: CalendarDay[];
  selDateLabel: string;
  scheduleLegend: string;
}
/** A class shown under the selected calendar day. `isPast` hides the 변경 affordance. */
export interface MemberDayClass {
  sessionId: string;
  time: string;
  trainerName: string;
  isPast: boolean;
}
export interface MemberReceiveView {
  trainerName: string;
  ago: string;
  before: string;
  reason?: string;
  type: "change" | "cancel"; // 강사가 보낸 요청 종류 — cancel이면 취소 전용 화면으로(감사 H7)
  sessionId: string; // the session this request targets ("다른 시간 제안" deep-links to it)
  slots: { id: string; label: string }[];
}
export interface MemberRequestView {
  sessionId: string;
  dateBox: { weekday: string; day: number };
  time: string;
  trainerName: string;
}

/* --------------------------- member · my page --------------------------- */
/** One stat in the profile hero (누적 출석 / 함께한 기간 / 미열람 공지). */
export interface MemberMyStat {
  value: string;
  unit: string;
  label: string;
}
export interface MemberMyMembership {
  productLabel: string; // "1:1 PT 20회권"
  remaining: number;
  total: number;
  dDay: number;
  endLabel: string; // "2026.08.21"
  barPct: number;
  expired: boolean; // paused면 false — 일시정지가 우선
  paused: boolean;
}
export interface MemberMyView {
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  statusLabel: string; // "활동 중" 등 (등급 칩 대체)
  stats: MemberMyStat[];
  membership: MemberMyMembership | null;
  trainer: { name: string; sub: string } | null;
  unreadNotices: number;
}

/** A single purchase row in 결제·구매 내역. */
export interface MemberPaymentItem {
  id: string;
  productLabel: string; // "1:1 PT 20회권"
  dateLabel: string; // "04.02 · 카드 결제"
  amount: number | null;
  statusLabel: string; // "결제완료" | "사용완료" | "환불됨" | "일시정지" | "환불"
  done: boolean; // true → 진행/완료 강조(sage), false → 종료(muted)
  refund: boolean; // amount<0 환불 행 → 부호/톤 별도 처리
}
export interface MemberPaymentYear {
  year: string;
  count: number;
  items: MemberPaymentItem[];
}
export interface MemberPaymentsView {
  totalAmount: number;
  totalCount: number;
  years: MemberPaymentYear[];
}

export type NoticeTone = "important" | "facility" | "ops";
export interface MemberNotice {
  id: string;
  tag: string; // "중요" | "시설" | "운영"
  tone: NoticeTone;
  dateLabel: string; // "08.10"
  title: string;
  body: string;
  unread: boolean;
}
export interface MemberNoticesView {
  notices: MemberNotice[];
  unread: number;
}

export interface MemberNotifItem {
  key: string;
  title: string;
  sub: string;
  on: boolean;
  ready: boolean; // false → 아직 미연동(토글 대신 "준비 중" 표시)
}
export interface MemberNotifGroup {
  title: string;
  items: MemberNotifItem[];
}
export interface MemberNotifView {
  groups: MemberNotifGroup[];
}

/* --------------------------- member · 운동 기록 --------------------------- */
/** One workout session the trainer logged for this member (read-only). */
export interface MemberWorkoutRecord {
  id: string;
  dateLabel: string; // "6월 24일 화"
  timeLabel: string; // "오후 9:00"
  exercises: { name: string; kg: number; sets: number }[];
  comment?: string;
}
export interface MemberWorkoutView {
  records: MemberWorkoutRecord[];
}

/* --------------------------- membership issue --------------------------- */
export type MembershipProduct = {
  id: string;
  name: string;
  sessions: number;
  price: number;
  unitListPrice: number;
  durationDays: number;
  active: boolean;
  sortOrder: number;
};

export type StudioSettings = {
  noshowDeducts: boolean;
  cancelCutoffHours: number;
  notifExpiry: boolean;
  notifSession: boolean;
  notifPayment: boolean;
};

export type ExerciseItem = { id: string; name: string; active: boolean; sortOrder: number; category?: string | null };

/* Re-export for convenience in screen code. */
export type { IconName };
