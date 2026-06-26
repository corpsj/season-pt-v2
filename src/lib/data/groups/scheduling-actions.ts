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

/** Active membership row (latest by end_date) for a member. */
async function activeMembership(memberId: string) {
  const { data } = await sb
    .from("memberships")
    .select("id, remaining_sessions")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("end_date", { ascending: false })
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

  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at")
    .eq("id", sessionId)
    .maybeSingle();
  const scheduledAt = session?.scheduled_at ?? new Date().toISOString();

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
    if (deducted && ms && after != null) await notifyLowSessions(ms.id, memberId, after);
  }

  await sb.from("sessions").update({ status: statusMap[action] }).eq("id", sessionId);

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

/** Accept a request: for change, move the session to the first proposed slot. */
export async function acceptRequest(requestId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: req } = await sb
    .from("schedule_change_requests")
    .select("id, session_id, type, proposed_slots")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "요청을 찾을 수 없어요." };

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

  await sb
    .from("schedule_change_requests")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  revalidatePath("/confirm");
  return { ok: true };
}

/** Reject a request. */
export async function rejectRequest(requestId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/t/inbox");
  return { ok: true };
}
