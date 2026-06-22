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
  product: "10" | "20" | "30";
  totalSessions: number;
  remainingSessions: number;
  startDate: string;
  endDate: string;
  price: number | null;
  status: "active" | "expired";
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
}

export interface PerfBar {
  label: string;
  valuePx: number;
  emphasized: boolean;
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
}

/* --------------------------- member app --------------------------- */
export interface MemberCalendarView {
  name: string;
  remaining: number;
  dDay: number;
  hasTrainerReq: boolean;
  monthLabel: string;
  calDays: CalendarDay[];
  selDateLabel: string;
  scheduleLegend: string;
  dayClass?: { sessionId: string; time: string; trainerName: string };
}
export interface MemberReceiveView {
  trainerName: string;
  ago: string;
  before: string;
  reason?: string;
  slots: { id: string; label: string }[];
}
export interface MemberRequestView {
  sessionId: string;
  dateBox: { weekday: string; day: number };
  time: string;
  trainerName: string;
  slots: { id: string; label: string }[];
}

/* --------------------------- membership issue --------------------------- */
export interface MembershipProduct {
  product: "10" | "20" | "30";
  label: string;
  price: number;
  recommended: boolean;
}

/* Re-export for convenience in screen code. */
export type { IconName };
