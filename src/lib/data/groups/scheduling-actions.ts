"use server";

import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { shouldDeduct } from "@/lib/data/deduction";
import { notifyLowSessions } from "@/lib/data/groups/notifications";
import type { AttendanceAction, WorkoutExercise } from "@/lib/types";

type ActionResult = { ok: boolean; error?: string };

/** Members attached to a session. */
async function memberIdsForSession(sessionId: string): Promise<string[]> {
  const { data } = await sb
    .from("session_members")
    .select("member_id")
    .eq("session_id", sessionId);
  return (data ?? []).map((r) => r.member_id as string);
}

/**
 * 회원의 "현재 사용 중" 활성 회원권 = 만료가 가장 임박한 것(end_date asc).
 * 표시(member.ts)·잔여(scheduling.ts)와 동일 기준이어야 차감 대상과 회원 화면이 일치한다.
 * (먼저 만료될 회원권부터 소진 = 회차 미사용 만료 방지.)
 */
async function activeMembership(memberId: string) {
  const { data } = await sb
    .from("memberships")
    .select("id, remaining_sessions")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("end_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { id: string; remaining_sessions: number } | null;
}

/**
 * Attendance: set session status; for attend/noshow decrement each member's
 * active membership remaining_sessions by 1; record an attendance_ledger row.
 */
export async function confirmAttendance(
  sessionId: string,
  action: AttendanceAction,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const statusMap: Record<AttendanceAction, "attended" | "noshow" | "cancelled"> = {
    attend: "attended",
    noshow: "noshow",
    cancel: "cancelled",
  };

  // Atomic claim: flip status only if still scheduled, so re-entry / double-tap / retry
  // can't deduct the same session twice (no DB transaction available in this stack).
  // 강사는 본인 담당 세션만(대표는 전체) — 무스코프 변이 차단.
  let claimQ = sb
    .from("sessions")
    .update({ status: statusMap[action] })
    .eq("id", sessionId)
    .eq("status", "scheduled");
  if (t.role !== "owner") claimQ = claimQ.eq("trainer_id", t.id);
  const { data: claimed } = await claimQ.select("scheduled_at");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 처리됐거나 담당 수업이 아니에요." };
  const scheduledAt = claimed[0].scheduled_at ?? new Date().toISOString();

  const settings = await getStudioSettings();
  const deducted = shouldDeduct(action, scheduledAt, settings);

  const memberIds = await memberIdsForSession(sessionId);
  for (const memberId of memberIds) {
    const ms = await activeMembership(memberId);
    const before = ms?.remaining_sessions ?? null;
    let after = before;
    if (deducted && ms) {
      after = Math.max(0, (ms.remaining_sessions ?? 0) - 1);
      await sb.from("memberships").update({ remaining_sessions: after }).eq("id", ms.id);
    }
    await sb.from("attendance_ledger").insert({
      session_id: sessionId,
      member_id: memberId,
      action,
      deducted,
      remaining_before: before,
      remaining_after: after,
      created_by: t.id,
    });
    if (deducted && ms && after != null) await notifyLowSessions(ms.id, memberId, after).catch(() => {}); // ponytail: notify is best-effort, attendance must not fail
  }

  revalidatePath("/t");
  return { ok: true };
}

/** Save a workout record for the session's (first) member. */
export async function saveRecord(
  sessionId: string,
  exercises: WorkoutExercise[],
  comment?: string,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const memberIds = await memberIdsForSession(sessionId);
  for (const memberId of memberIds) {
    await sb.from("workout_records").insert({
      session_id: sessionId,
      member_id: memberId,
      exercises,
      comment: comment ?? null,
      created_by: t.id,
    });
  }

  revalidatePath("/t");
  return { ok: true };
}

/** Trainer proposes new times: insert a pending change request. */
export async function sendPropose(
  sessionId: string,
  proposedSlots: string[],
  reason?: string,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at")
    .eq("id", sessionId)
    .maybeSingle();

  await sb.from("schedule_change_requests").insert({
    session_id: sessionId,
    requester_type: "trainer",
    requester_id: t.id,
    type: "change",
    status: "pending",
    reason: reason ?? null,
    original_at: session?.scheduled_at ?? null,
    proposed_slots: proposedSlots,
  });

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  return { ok: true };
}

/** Trainer requests to cancel this session: insert a pending cancel request (회원 확인 대상). */
export async function sendCancelRequest(sessionId: string, reason?: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (session.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요." };

  // 동일 세션에 대기 중인 요청이 있으면 중복 생성 방지
  const { data: dup } = await sb
    .from("schedule_change_requests")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (dup) return { ok: false, error: "이미 대기 중인 요청이 있어요." };

  await sb.from("schedule_change_requests").insert({
    session_id: sessionId,
    requester_type: "trainer",
    requester_id: t.id,
    type: "cancel",
    status: "pending",
    reason: reason ?? null,
    original_at: session.scheduled_at,
    proposed_slots: [],
  });

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  return { ok: true };
}

/** Accept a request: for change, move the session to the first proposed slot. */
export async function acceptRequest(requestId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  // 강사는 본인 담당 세션의 요청만 처리(대표는 전체).
  if (t.role !== "owner") {
    const { data: pre } = await sb.from("schedule_change_requests").select("session_id").eq("id", requestId).maybeSingle();
    if (!pre) return { ok: false, error: "요청을 찾을 수 없어요." };
    const { data: s } = await sb.from("sessions").select("trainer_id").eq("id", pre.session_id).maybeSingle();
    if (s?.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  }

  // Atomic claim: accept only if still pending, so re-accepting a resolved request
  // can't move/cancel the session (and re-deduct) a second time.
  const { data: claimedReq } = await sb
    .from("schedule_change_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, session_id, type, proposed_slots");
  if (!claimedReq || claimedReq.length === 0) return { ok: false, error: "이미 처리된 요청이에요." };
  const req = claimedReq[0];

  if (req.type === "change") {
    const slots = (req.proposed_slots as string[] | null) ?? [];
    if (slots.length) {
      await sb.from("sessions").update({ scheduled_at: slots[0] }).eq("id", req.session_id);
    }
  } else {
    // cancel request: mark session cancelled, apply deduction policy
    const { data: session } = await sb
      .from("sessions")
      .select("scheduled_at")
      .eq("id", req.session_id)
      .maybeSingle();
    const scheduledAt = session?.scheduled_at ?? new Date().toISOString();
    const settings = await getStudioSettings();
    const deducted = shouldDeduct("cancel", scheduledAt, settings);

    await sb.from("sessions").update({ status: "cancelled" }).eq("id", req.session_id);

    if (deducted) {
      const memberIds = await memberIdsForSession(req.session_id);
      for (const memberId of memberIds) {
        const ms = await activeMembership(memberId);
        const before = ms?.remaining_sessions ?? null;
        let after = before;
        if (ms) {
          after = Math.max(0, (ms.remaining_sessions ?? 0) - 1);
          await sb.from("memberships").update({ remaining_sessions: after }).eq("id", ms.id);
        }
        await sb.from("attendance_ledger").insert({
          session_id: req.session_id,
          member_id: memberId,
          action: "cancel",
          deducted: true,
          remaining_before: before,
          remaining_after: after,
          created_by: t.id,
        });
      }
    }
  }

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  revalidatePath("/confirm");
  return { ok: true };
}

/** Reject a request. */
export async function rejectRequest(requestId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: rejected } = await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (!rejected || rejected.length === 0) return { ok: false, error: "이미 처리된 요청이에요." };

  revalidatePath("/t/inbox");
  return { ok: true };
}
