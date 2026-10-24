import type { AvatarTone, SessionStatus, WorkoutExercise } from "@/lib/types";

export type WorkoutDraft = {
  exercises: WorkoutExercise[];
  comment: string;
  version: number;
};
export type WorkspaceMember = WorkoutDraft & {
  memberId: string;
  name: string;
  initial: string;
  avatarTone: AvatarTone;
  remaining: number;
  previous: WorkoutExercise[];
  previousDate: string | null;
};
export type ClassWorkspace = {
  editorId: string;
  history?: { action: string; reason: string; at: string }[];
  sessionId: string;
  attendanceVersion: number;
  status: SessionStatus;
  dateLabel: string;
  scheduledAt: string;
  canComplete?: boolean;
  members: WorkspaceMember[];
};
export type WorkflowResult = {
  ok: boolean;
  error?: string;
  conflict?: boolean;
  version?: number;
  replayed?: boolean;
  balances?: {
    memberId: string;
    remaining: number | null;
    totalRemaining?: number;
    deducted?: boolean;
  }[];
};
export type AttendanceOptions = {
  operationId: string;
  expectedVersion: number;
  versions?: Record<string, number>;
  allowFree?: boolean;
  reason?: string;
};
