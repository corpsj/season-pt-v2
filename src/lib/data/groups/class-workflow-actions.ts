"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import {
  parseWorkoutExercises,
  validateWorkoutInput,
} from "@/lib/data/workout-sets";
import type {
  WorkoutDraft,
  WorkflowResult,
  AttendanceOptions,
} from "@/lib/data/class-workflow-types";
import type { AttendanceAction } from "@/lib/types";
import { notifyLowSessions } from "./notifications";

const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const version = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const versionsValid = (v: unknown): v is Record<string, number> =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.entries(v).length <= 2 &&
  Object.entries(v).every(([id, n]) => uuid(id) && version(n));
function refresh(id: string) {
  for (const path of [
    "/t",
    "/console",
    "/m",
    `/t/class/${id}`,
    `/t/record/${id}`,
    "/m/my/records",
  ])
    revalidatePath(path);
}
function outcome(data: unknown, error: unknown): WorkflowResult {
  if (error)
    return {
      ok: false,
      error:
        "저장하지 못했어요. 연결 상태와 데이터베이스 업데이트를 확인한 뒤 다시 시도해주세요.",
    };
  const d = data as {
    status?: string;
    version?: number;
    replayed?: boolean;
    deductions?: WorkflowResult["balances"];
  } | null;
  if (d?.status === "ok")
    return {
      ok: true,
      version: d.version,
      replayed: d.replayed,
      balances: d.deductions,
    };
  const conflict = d?.status === "conflict" || d?.status === "stale";
  return {
    ok: false,
    conflict,
    error: conflict
      ? "다른 화면에서 변경됐어요. 입력을 확인하고 새로고침해주세요."
      : d?.status === "forbidden"
        ? "담당 수업만 처리할 수 있어요."
        : d?.status === "future"
          ? "출석 처리는 수업 당일부터 할 수 있어요."
          : d?.status === "signature_required"
            ? "회원 확인 서명을 받아주세요."
            : "수업 상태를 확인한 뒤 다시 시도해주세요.",
  };
}

export async function saveClassDraft(
  sessionId: string,
  memberId: string,
  draft: WorkoutDraft,
): Promise<WorkflowResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };
  if (!uuid(sessionId) || !uuid(memberId) || !version(draft?.version))
    return { ok: false, error: "기록 정보가 올바르지 않아요." };
  const invalid = validateWorkoutInput(draft.exercises, draft.comment);
  if (invalid) return { ok: false, error: invalid };
  const { data, error } = await sb.rpc("save_class_workout_draft", {
    p_session: sessionId,
    p_member: memberId,
    p_actor: t.id,
    p_version: draft.version,
    p_exercises: parseWorkoutExercises(draft.exercises),
    p_comment: draft.comment,
  });
  // Autosave does not publish or invalidate the page while the user is typing.
  return outcome(data, error);
}

export async function publishClassRecords(
  sessionId: string,
  versions: Record<string, number>,
): Promise<WorkflowResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };
  if (!uuid(sessionId) || !versionsValid(versions))
    return { ok: false, error: "기록 정보가 올바르지 않아요." };
  const { data, error } = await sb.rpc("publish_class_workouts", {
    p_session: sessionId,
    p_actor: t.id,
    p_versions: versions,
  });
  const result = outcome(data, error);
  if (result.ok) refresh(sessionId);
  return result;
}

export async function processClassAttendance(
  sessionId: string,
  action: AttendanceAction | "revert",
  signature: string | undefined,
  options: AttendanceOptions,
): Promise<WorkflowResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요." };
  if (
    !uuid(sessionId) ||
    !uuid(options?.operationId) ||
    !version(options.expectedVersion) ||
    (options.reason !== undefined && typeof options.reason !== "string") ||
    !["attend", "noshow", "cancel", "revert"].includes(action) ||
    (options.versions !== undefined && !versionsValid(options.versions))
  )
    return { ok: false, error: "화면을 새로고침한 뒤 다시 시도해주세요." };
  if (
    action === "attend" &&
    (typeof signature !== "string" ||
      !signature.startsWith("data:image/png;base64,") ||
      signature.length > 200000)
  )
    return { ok: false, error: "회원 확인 서명을 받아주세요." };
  if (action === "revert" && !options.reason?.trim())
    return { ok: false, error: "정정 사유를 입력해주세요." };
  const { data, error } = await sb.rpc("class_attendance_atomic", {
    p_session: sessionId,
    p_actor: t.id,
    p_action: action,
    p_version: options.expectedVersion,
    p_operation: options.operationId,
    p_signature: signature ?? null,
    p_versions: options.versions ?? null,
    p_allow_free: options.allowFree === true,
    p_reason: options.reason?.slice(0, 500) ?? "",
  });
  if (error?.message?.includes("insufficient_credit"))
    return {
      ok: false,
      error:
        "사용 가능한 회차가 부족해요. 회원권·유효기간을 확인하거나 무료 수업 여부를 확인해주세요.",
    };
  if (
    error?.message?.includes("ineligible_restore") ||
    error?.message?.includes("missing_original_membership")
  )
    return {
      ok: false,
      error:
        "원래 회원권을 자동 복원할 수 없어요. 대표에게 환불·양도 상태 확인을 요청해주세요.",
    };
  if (error?.message?.includes("draft_conflict"))
    return {
      ok: false,
      conflict: true,
      error: "다른 화면의 운동 기록과 충돌했어요. 새로고침 후 확인해주세요.",
    };
  const result = outcome(data, error);
  if (result.ok) {
    refresh(sessionId);
    if (!result.replayed && action !== "revert") {
      const details =
        (
          data as {
            deductions?: {
              memberId: string;
              membershipId: string | null;
              remaining: number | null;
            }[];
          }
        ).deductions ?? [];
      await Promise.all(
        details
          .filter((d) => d.membershipId && d.remaining != null)
          .map((d) =>
            notifyLowSessions(d.membershipId!, d.memberId, d.remaining!).catch(
              () => {},
            ),
          ),
      );
    }
  }
  return result;
}
