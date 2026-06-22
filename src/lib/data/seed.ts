// Seed constants from DESIGN_SPEC.md 부록 (prototype defaults). Used by the mock
// repository for UI-first development. Dates are illustrative (the prototype's
// calendar is a template); real calendars are computed in P3.

import type { AvatarTone, SessionType } from "@/lib/types";

export const MONTH_LABEL = "2026년 6월";
export const SELECTED_DAY = 21;
export const DAYS_IN_MONTH = 30;
/** Design grid treats June 1 as Sunday (column 0). */
export const FIRST_WEEKDAY = 0;
export const CAL_DOTS = new Set([2, 4, 6, 9, 12, 16, 17, 19, 21, 23, 26]);

export const ME_TRAINER = { name: "김계절", roleLabel: "대표", trainerId: "t_owner" };

export const TOTAL_MEMBERS = 24;
export const REST_COUNT = 2;

export interface SeedMember {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  status: "active" | "expiring" | "rest";
  type: SessionType;
  /** team partner (for 2:1) */
  team?: { init1: string; tone1: AvatarTone; init2: string; tone2: AvatarTone };
  remaining: number;
  total: number;
  dDay: number;
  product: string;
  weekdays: number[]; // 0=Sun..6=Sat
  hour: number; // 24h
  scheduleLabel: string;
  guided?: boolean;
  startDate: string;
  endDate: string;
  body: { weight: number; skeletalMuscle: number; bodyFat: number };
  injury?: string;
}

export const MEMBERS: SeedMember[] = [
  {
    id: "m_jung",
    name: "정민호",
    initial: "정",
    avatarTone: "sageMid",
    status: "expiring",
    type: "1on1",
    remaining: 1,
    total: 20,
    dDay: 3,
    product: "1:1 PT 20회권",
    weekdays: [2, 4],
    hour: 18,
    scheduleLabel: "매주 화·목 오후 6시",
    startDate: "2026.03.24",
    endDate: "2026.06.24",
    body: { weight: 74.1, skeletalMuscle: 35.2, bodyFat: 17.8 },
  },
  {
    id: "m_park",
    name: "박서연",
    initial: "박",
    avatarTone: "sage",
    status: "expiring",
    type: "1on1",
    remaining: 2,
    total: 20,
    dDay: 5,
    product: "1:1 PT 20회권",
    weekdays: [1, 3],
    hour: 19,
    scheduleLabel: "매주 월·수 오후 7시",
    guided: true,
    startDate: "2026.03.26",
    endDate: "2026.06.26",
    body: { weight: 55.4, skeletalMuscle: 24.1, bodyFat: 19.2 },
  },
  {
    id: "m_iji",
    name: "이지수",
    initial: "이",
    avatarTone: "gold",
    status: "expiring",
    type: "1on1",
    remaining: 3,
    total: 20,
    dDay: 9,
    product: "1:1 PT 20회권",
    weekdays: [3, 6],
    hour: 19,
    scheduleLabel: "매주 수·토 오후 7시",
    startDate: "2026.03.30",
    endDate: "2026.06.30",
    body: { weight: 58.2, skeletalMuscle: 32.0, bodyFat: 22.1 },
    injury: "오른쪽 어깨 회전근 주의 — 오버헤드 동작 시 무게 보수적으로.",
  },
  {
    id: "m_han",
    name: "한지우",
    initial: "한",
    avatarTone: "sage",
    status: "active",
    type: "1on1",
    remaining: 12,
    total: 20,
    dDay: 48,
    product: "1:1 PT 20회권",
    weekdays: [1, 5],
    hour: 20,
    scheduleLabel: "매주 월·금 오후 8시",
    startDate: "2026.05.10",
    endDate: "2026.08.10",
    body: { weight: 68.0, skeletalMuscle: 33.5, bodyFat: 15.4 },
  },
  {
    id: "m_team",
    name: "윤지아·강민",
    initial: "윤",
    avatarTone: "sage",
    status: "active",
    type: "2on1",
    team: { init1: "윤", tone1: "sage", init2: "강", tone2: "gold" },
    remaining: 8,
    total: 20,
    dDay: 40,
    product: "2:1 PT 20회권",
    weekdays: [2, 6],
    hour: 20,
    scheduleLabel: "매주 화·토 오후 8시",
    startDate: "2026.05.02",
    endDate: "2026.08.02",
    body: { weight: 60.0, skeletalMuscle: 26.0, bodyFat: 24.0 },
  },
];

export interface SeedRequest {
  id: string;
  memberId: string;
  ago: string;
  type: "change" | "cancel";
  before?: string;
  after?: string;
  reason?: string;
}

export const RECEIVED_REQUESTS: SeedRequest[] = [
  {
    id: "rq_park",
    memberId: "m_park",
    ago: "10분 전",
    type: "change",
    before: "6/20 토 19:00",
    after: "6/22 월 19:00",
  },
  {
    id: "rq_jung",
    memberId: "m_jung",
    ago: "32분 전",
    type: "cancel",
    before: "6/19 목 18:00",
    reason: "출장 일정",
  },
  {
    id: "rq_iji",
    memberId: "m_iji",
    ago: "1시간 전",
    type: "change",
    before: "6/21 토 19:00",
    after: "6/22 일 19:00",
  },
];

export const SENT_REQUESTS = [
  { id: "sq_iji", memberId: "m_iji", summary: "6/21 → 6/22 · 오후 7:00", status: "awaiting" as const },
];

export interface SeedStaff {
  id: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  role: "owner" | "instructor" | "invited";
  count?: number;
  isMe: boolean;
}
export const STAFF: SeedStaff[] = [
  { id: "t_owner", name: "김계절", initial: "계", avatarTone: "sage", role: "owner", count: 24, isMe: true },
  { id: "t_sumin", name: "이수민", initial: "이", avatarTone: "sageMid", role: "instructor", count: 12, isMe: false },
  { id: "t_jihun", name: "박지훈", initial: "박", avatarTone: "sageSoft", role: "instructor", count: 9, isMe: false },
  { id: "t_haneul", name: "정하늘", initial: "정", avatarTone: "pending", role: "invited", isMe: false },
];

export const DEFAULT_EXERCISES = [
  { name: "바벨 스쿼트", kg: 40, sets: 5 },
  { name: "루마니안 데드리프트", kg: 35, sets: 4 },
];

export const MEMBERSHIP_PRODUCTS = [
  { product: "10" as const, label: "10회권", price: 750000, recommended: false },
  { product: "20" as const, label: "20회권", price: 1400000, recommended: true },
  { product: "30" as const, label: "30회권", price: 1980000, recommended: false },
];

export const PERF = {
  monthLabel: "2026년 6월",
  revenue: 5800000,
  revenueDelta: 8,
  classCount: 84,
  memberCount: 24,
  attendRate: 96,
  weeklyBars: [
    { label: "월", valuePx: 34, emphasized: false },
    { label: "화", valuePx: 50, emphasized: false },
    { label: "수", valuePx: 40, emphasized: false },
    { label: "목", valuePx: 56, emphasized: false },
    { label: "금", valuePx: 46, emphasized: false },
    { label: "토", valuePx: 60, emphasized: true },
  ],
  expectedRevenue: 4200000,
};

/** Logged-in member for the member app (이지수). */
export const MEMBER_VIEWER_ID = "m_iji";
