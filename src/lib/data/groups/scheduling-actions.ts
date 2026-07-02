"use server";

import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { shouldDeduct } from "@/lib/data/deduction";
import { notifyLowSessions, notifyRequestResult } from "@/lib/data/groups/notifications";
import { hasSlotConflict, moveSessionWithTombstone } from "@/lib/data/groups/session-mutations";
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
    .gt("remaining_sessions", 0) // 잔여 0 회원권이 재등록분 차감을 가로채 무료 수업이 되는 것 방지(감사 C2)
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
  const { data: claimed } = await claimQ.select("scheduled_at, trainer_id, type");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 처리됐거나 담당 수업이 아니에요." };
  const scheduledAt = claimed[0].scheduled_at ?? new Date().toISOString();

  // 정산용: 진행(출석) 확정 시점의 회당 단가를 세션에 스냅샷. 이후 강사 단가를 바꿔도 과거 정산은 불변.
  if (action === "attend") {
    const { data: tr } = await sb.from("trainers").select("rate_1on1, rate_2on1").eq("id", claimed[0].trainer_id).maybeSingle();
    const rate = claimed[0].type === "2on1" ? (tr?.rate_2on1 ?? 0) : (tr?.rate_1on1 ?? 0);
    await sb.from("sessions").update({ pay_rate: rate }).eq("id", sessionId);
  }

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
      membership_id: ms?.id ?? null, // 되돌리기 시 정확히 이 회원권에 복원(감사 후속)
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
  if (memberIds.length === 0) return { ok: false, error: "기록할 회원이 없어요." };
  for (const memberId of memberIds) {
    // insert 오류를 삼키지 않는다 — 약한 네트워크에서 기록이 통째로 유실됐는데도 성공 표시되던 버그(감사 H10).
    const { error } = await sb.from("workout_records").insert({
      session_id: sessionId,
      member_id: memberId,
      exercises,
      comment: comment ?? null,
      created_by: t.id,
    });
    if (error) return { ok: false, error: "기록 저장에 실패했어요. 다시 시도해주세요." };
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

/** Accept a request: for change, move the session (+tombstone); for cancel, cancel with policy. */
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
    .select("id, session_id, requester_id, type, proposed_slots, created_at");
  if (!claimedReq || claimedReq.length === 0) return { ok: false, error: "이미 처리된 요청이에요." };
  const req = claimedReq[0];

  // 요청 대상 세션의 현재 상태·시각·트레이너(가드/표식용).
  const { data: session } = await sb
    .from("sessions")
    .select("trainer_id, type, source_schedule_id, scheduled_at, status")
    .eq("id", req.session_id)
    .maybeSingle();

  // 세션이 이미 출석/노쇼/취소 처리됐으면 요청 수락은 무효 → 요청을 정리(rejected)하고 알린다(감사 C1).
  if (!session || session.status !== "scheduled") {
    await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
    return { ok: false, error: "이미 진행됐거나 처리된 수업이에요. 요청을 정리했어요." };
  }

  if (req.type === "change") {
    const slots = (req.proposed_slots as string[] | null) ?? [];
    const target = slots[0];
    if (!target) {
      await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
      return { ok: false, error: "제안된 시간이 없어 변경할 수 없어요." };
    }
    // 더블부킹 가드(감사 H6): 같은 강사·같은 시각에 다른 scheduled 세션이 있으면 거부.
    if (await hasSlotConflict(session.trainer_id as string, target, req.session_id)) {
      await sb.from("schedule_change_requests").update({ status: "pending" }).eq("id", req.id); // 되돌려 재시도 가능
      return { ok: false, error: "그 시간에 이미 다른 수업이 있어요." };
    }
    const moved = await moveSessionWithTombstone(req.session_id, target);
    if (!moved) {
      await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
      return { ok: false, error: "이미 처리된 수업이에요. 요청을 정리했어요." };
    }
    await notifyRequestResult({
      recipientType: "member",
      recipientId: req.requester_id as string,
      kind: "change",
      accepted: true,
    }).catch(() => {});
  } else {
    // cancel request: atomic-claim the session, then apply deduction by REQUEST time (감사 C1·C4).
    const settings = await getStudioSettings();
    // 회원이 요청한 시점 기준으로 컷오프 판정 — 강사가 늦게 수락해도 부당 차감되지 않게(감사 C4).
    const requestedMs = req.created_at ? new Date(req.created_at as string).getTime() : Date.now();
    const deducted = shouldDeduct("cancel", session.scheduled_at as string, settings, requestedMs);

    const { data: cancelledRows } = await sb
      .from("sessions")
      .update({ status: "cancelled" })
      .eq("id", req.session_id)
      .eq("status", "scheduled")
      .select("id");
    if (!cancelledRows || cancelledRows.length === 0) {
      await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
      return { ok: false, error: "이미 진행됐거나 처리된 수업이에요. 요청을 정리했어요." };
    }

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
          membership_id: ms?.id ?? null, // 되돌리기 시 정확히 이 회원권에 복원(감사 후속)
          action: "cancel",
          deducted: true,
          remaining_before: before,
          remaining_after: after,
          created_by: t.id,
        });
        if (ms && after != null) await notifyLowSessions(ms.id, memberId, after).catch(() => {});
      }
    }
    await notifyRequestResult({
      recipientType: "member",
      recipientId: req.requester_id as string,
      kind: "cancel",
      accepted: true,
    }).catch(() => {});
  }

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  revalidatePath("/confirm");
  return { ok: true };
}

/** Reject a request. Notifies the requesting member of the outcome (감사 H8). */
export async function rejectRequest(requestId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: rejected } = await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id, requester_id, type");
  if (!rejected || rejected.length === 0) return { ok: false, error: "이미 처리된 요청이에요." };
  const r = rejected[0];
  await notifyRequestResult({
    recipientType: "member",
    recipientId: r.requester_id as string,
    kind: (r.type as "change" | "cancel") ?? "change",
    accepted: false,
  }).catch(() => {});

  revalidatePath("/t/inbox");
  return { ok: true };
}

/**
 * 출석/노쇼/취소 오처리 되돌리기(정정). 세션을 scheduled로 원자 복구하고, 차감됐던 회차를 복원,
 * 해당 세션의 attendance_ledger를 정리한다. 앱에 정정 수단이 전무했던 문제(감사 H1). 대표 또는 담당 강사.
 */
export async function revertAttendance(sessionId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  // 원자 클레임: 처리된(attended/noshow/cancelled) 세션만 scheduled로 되돌린다.
  let claimQ = sb
    .from("sessions")
    .update({ status: "scheduled", pay_rate: null })
    .eq("id", sessionId)
    .in("status", ["attended", "noshow", "cancelled"]);
  if (t.role !== "owner") claimQ = claimQ.eq("trainer_id", t.id);
  const { data: claimed } = await claimQ.select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "되돌릴 수 없는 수업이에요(이미 예정 상태이거나 담당이 아니에요)." };

  // 차감됐던 회차 복원: 원장에서 '실제로 감소한' 행만(remaining_before>after) 그 회원권에 +1 복원.
  // membership_id로 차감된 바로 그 회원권을 집는다 — 만료 임박 다른 회원권에 잘못 붙거나(재등록 중복),
  // 차감이 없었는데(잔여0) 유령 회차가 생기던 문제를 막는다(감사 후속).
  const { data: ledger } = await sb
    .from("attendance_ledger")
    .select("membership_id, deducted, remaining_before, remaining_after")
    .eq("session_id", sessionId);
  const credited = new Set<string>();
  for (const row of ledger ?? []) {
    const msId = row.membership_id as string | null;
    const before = row.remaining_before as number | null;
    const after = row.remaining_after as number | null;
    const reallyDeducted = !!row.deducted && before != null && after != null && before > after;
    if (!reallyDeducted || !msId || credited.has(msId)) continue;
    credited.add(msId);
    const { data: ms } = await sb.from("memberships").select("remaining_sessions, total_sessions").eq("id", msId).maybeSingle();
    if (ms) {
      const cur = (ms.remaining_sessions as number) ?? 0;
      const cap = (ms.total_sessions as number | null) ?? cur + 1;
      await sb.from("memberships").update({ remaining_sessions: Math.min(cap, cur + 1) }).eq("id", msId);
    }
  }
  // 원장 정리 — 세션이 미처리 상태로 돌아가므로 이 세션의 처리 기록을 제거(재처리 시 새로 기록).
  await sb.from("attendance_ledger").delete().eq("session_id", sessionId);

  revalidatePath("/t");
  revalidatePath("/console");
  return { ok: true };
}
