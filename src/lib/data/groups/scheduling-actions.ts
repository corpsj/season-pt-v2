"use server";

import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { shouldDeduct } from "@/lib/data/deduction";
import { notifyLowSessions, notifyRequestResult } from "@/lib/data/groups/notifications";
import {
  hasSlotConflict,
  moveSessionWithTombstone,
  claimCancelSession,
  rejectPendingRequestsForSession,
} from "@/lib/data/groups/session-mutations";
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
 * 세션 처리(출석/노쇼/취소 차감)의 회차 차감 + 원장 기록. 실패 시 에러 문구 반환(성공 시 null).
 * - 차감은 낙관적 CAS: 잔여값이 읽은 값과 같을 때만 갱신 — 절대값 덮어쓰기로 동시 차감 1회가
 *   유실되던 문제(감사 #12). 충돌 시 한 번 다시 읽고 재시도.
 * - 차감/원장 insert 에러를 삼키지 않는다(감사 #4) — 호출부가 보상(세션 원복)을 수행.
 */
async function deductForMembers(args: {
  sessionId: string;
  memberIds: string[];
  action: AttendanceAction;
  deducted: boolean;
  createdBy: string;
}): Promise<string | null> {
  for (const memberId of args.memberIds) {
    let ms = await activeMembership(memberId);
    let before = ms?.remaining_sessions ?? null;
    let after = before;
    if (args.deducted && ms) {
      let applied = false;
      for (let attempt = 0; attempt < 2 && ms; attempt++) {
        const cur = ms.remaining_sessions ?? 0;
        const next = Math.max(0, cur - 1);
        const { data: rows, error } = await sb
          .from("memberships")
          .update({ remaining_sessions: next })
          .eq("id", ms.id)
          .eq("remaining_sessions", cur)
          .select("id");
        if (error) return "차감을 저장하지 못했어요.";
        if (rows && rows.length) {
          before = cur;
          after = next;
          applied = true;
          break;
        }
        ms = await activeMembership(memberId); // 동시 차감으로 잔여가 바뀜 — 다시 읽고 재시도
      }
      if (!applied && ms) return "동시에 처리되고 있어요. 잠시 후 다시 시도해주세요.";
      if (!ms) {
        before = null;
        after = null;
      }
    }
    const { error: ledErr } = await sb.from("attendance_ledger").insert({
      session_id: args.sessionId,
      member_id: memberId,
      membership_id: ms?.id ?? null, // 되돌리기 시 정확히 이 회원권에 복원(감사 후속)
      action: args.action,
      deducted: args.deducted,
      remaining_before: before,
      remaining_after: after,
      created_by: args.createdBy,
    });
    if (ledErr) return "출석 기록을 저장하지 못했어요.";
    if (args.deducted && ms && after != null) await notifyLowSessions(ms.id, memberId, after).catch(() => {}); // ponytail: notify is best-effort
  }
  return null;
}

/**
 * 처리된 세션의 복구 공용부(정정·보상 겸용): 원장에서 실차감 행만 그 회원권에 +1 복원하고
 * 행 단위로 원장을 지운 뒤 세션을 scheduled로 되돌린다. 복원 실패 시 원장을 보존해 재시도 가능(감사 #17).
 */
async function restoreProcessedSession(sessionId: string): Promise<ActionResult> {
  const { data: ledger, error: ledErr } = await sb
    .from("attendance_ledger")
    .select("id, membership_id, deducted, remaining_before, remaining_after")
    .eq("session_id", sessionId);
  if (ledErr) return { ok: false, error: "기록 조회에 실패했어요. 다시 시도해주세요." };
  const credited = new Set<string>();
  for (const row of ledger ?? []) {
    const msId = row.membership_id as string | null;
    const before = row.remaining_before as number | null;
    const after = row.remaining_after as number | null;
    const reallyDeducted = !!row.deducted && before != null && after != null && before > after;
    if (reallyDeducted && msId && !credited.has(msId)) {
      credited.add(msId);
      const { data: ms, error: msErr } = await sb
        .from("memberships")
        .select("remaining_sessions, total_sessions")
        .eq("id", msId)
        .maybeSingle();
      if (msErr) return { ok: false, error: "회차 복원에 실패했어요. 다시 시도해주세요." };
      if (ms) {
        const cur = (ms.remaining_sessions as number) ?? 0;
        const cap = (ms.total_sessions as number | null) ?? cur + 1;
        const { error: upErr } = await sb
          .from("memberships")
          .update({ remaining_sessions: Math.min(cap, cur + 1) })
          .eq("id", msId);
        if (upErr) return { ok: false, error: "회차 복원에 실패했어요. 다시 시도해주세요." }; // 원장 보존 — 재시도 가능
      }
    }
    // 행 단위 삭제 — 중간 실패 시 남은 행만 재처리(전체 후행 삭제는 재시도 시 이중 복원 위험)
    const { error: delErr } = await sb.from("attendance_ledger").delete().eq("id", row.id);
    if (delErr) return { ok: false, error: "기록 정리에 실패했어요. 다시 시도해주세요." };
  }
  await sb
    .from("sessions")
    .update({ status: "scheduled", pay_rate: null })
    .eq("id", sessionId)
    .in("status", ["attended", "noshow", "cancelled"]);
  return { ok: true };
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

  // 처리 확정된 세션의 낡은 pending 요청 정리 — 뒤늦은 수락으로 되살아나는 것 방지(감사 high #2).
  await rejectPendingRequestsForSession(sessionId);

  // 정산용: 진행(출석) 확정 시점의 회당 단가를 세션에 스냅샷. 이후 강사 단가를 바꿔도 과거 정산은 불변.
  // 단가 미설정(0)은 스냅샷하지 않는다(null 유지) — 대표가 단가를 나중에 입력해도 정산 시 현재 단가로
  // 소급 계산되고, 지급 확정 때 확정값이 백필된다(감사 high #1: 0 스냅샷이 영구 0원이 되던 문제).
  if (action === "attend") {
    const { data: tr } = await sb.from("trainers").select("rate_1on1, rate_2on1").eq("id", claimed[0].trainer_id).maybeSingle();
    const rate = claimed[0].type === "2on1" ? (tr?.rate_2on1 ?? 0) : (tr?.rate_1on1 ?? 0);
    if (rate > 0) await sb.from("sessions").update({ pay_rate: rate }).eq("id", sessionId);
  }

  const settings = await getStudioSettings();
  const deducted = shouldDeduct(action, scheduledAt, settings);

  const memberIds = await memberIdsForSession(sessionId);
  const failMsg = await deductForMembers({ sessionId, memberIds, action, deducted, createdBy: t.id });
  if (failMsg) {
    // 보상: 부분 차감·원장 정리 후 세션을 scheduled로 원복 — 반쪽 상태로 남기지 않는다(감사 #4).
    await restoreProcessedSession(sessionId);
    return { ok: false, error: failMsg };
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

  // 강사는 본인 담당 세션만 기록(대표는 전체) — 임의 sessionId 변이 차단(감사 #14).
  const { data: target } = await sb.from("sessions").select("trainer_id").eq("id", sessionId).maybeSingle();
  if (!target) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && target.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };

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
  if (!proposedSlots || proposedSlots.length === 0) return { ok: false, error: "제안할 시간을 선택해주세요." };

  // 세션 상태·담당 가드(감사 #14·#16): 이미 처리된 수업이나 남의 수업에 제안 불가.
  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at, status, trainer_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  if (session.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요." };

  // 기존 pending 정리(감사 #16): 회원 요청이 대기 중이면 먼저 응답하도록 막고,
  // 이전 강사 제안이 남아 있으면 새 제안으로 대체(reject 후 insert).
  const { data: pend } = await sb
    .from("schedule_change_requests")
    .select("id, requester_type")
    .eq("session_id", sessionId)
    .eq("status", "pending");
  if ((pend ?? []).some((r) => r.requester_type === "member")) {
    return { ok: false, error: "회원의 요청이 대기 중이에요. 받은 요청에서 먼저 응답해주세요." };
  }
  if (pend && pend.length) {
    await sb
      .from("schedule_change_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .in("id", pend.map((r) => r.id as string));
  }

  const { error } = await sb.from("schedule_change_requests").insert({
    session_id: sessionId,
    requester_type: "trainer",
    requester_id: t.id,
    type: "change",
    status: "pending",
    reason: reason ?? null,
    original_at: session.scheduled_at,
    proposed_slots: proposedSlots,
  });
  if (error) return { ok: false, error: "제안을 보내지 못했어요. 다시 시도해주세요." }; // 유실을 성공으로 표시하지 않는다(감사 #37)

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
    .select("scheduled_at, status, trainer_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." }; // 감사 #14
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

  const { error } = await sb.from("schedule_change_requests").insert({
    session_id: sessionId,
    requester_type: "trainer",
    requester_id: t.id,
    type: "cancel",
    status: "pending",
    reason: reason ?? null,
    original_at: session.scheduled_at,
    proposed_slots: [],
  });
  if (error) return { ok: false, error: "요청을 보내지 못했어요. 다시 시도해주세요." }; // 감사 #37

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
    .select("id, session_id, requester_id, type, proposed_slots, created_at, original_at");
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

  // 요청 생성 후 세션 시간이 이미 바뀌었으면(다른 요청 수락 등) 낡은 요청 — 수락하면 합의된 시간을
  // 되돌리므로 정리한다(감사 high #2 신선도 가드).
  if (req.original_at && session.scheduled_at !== req.original_at) {
    await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
    return { ok: false, error: "수업 시간이 이미 변경돼 요청이 만료됐어요. 요청을 정리했어요." };
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

    const cancelled = await claimCancelSession(req.session_id); // 취소 + 낡은 pending 정리
    if (!cancelled) {
      await sb.from("schedule_change_requests").update({ status: "rejected" }).eq("id", req.id);
      return { ok: false, error: "이미 진행됐거나 처리된 수업이에요. 요청을 정리했어요." };
    }

    if (deducted) {
      const memberIds = await memberIdsForSession(req.session_id);
      const failMsg = await deductForMembers({
        sessionId: req.session_id,
        memberIds,
        action: "cancel",
        deducted: true,
        createdBy: t.id,
      });
      if (failMsg) {
        // 보상: 세션·차감·원장을 원복하고 요청을 pending으로 되돌려 재시도 가능하게(감사 #4).
        await restoreProcessedSession(req.session_id);
        await sb
          .from("schedule_change_requests")
          .update({ status: "pending", resolved_at: null })
          .eq("id", req.id);
        return { ok: false, error: failMsg };
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
  if (!claimed || claimed.length === 0) {
    // 재개 경로: 직전 되돌리기가 복원 중 실패해 세션은 이미 scheduled인데 원장이 남은 경우 이어서 복구.
    let chk = sb.from("sessions").select("id").eq("id", sessionId).eq("status", "scheduled");
    if (t.role !== "owner") chk = chk.eq("trainer_id", t.id);
    const { data: s } = await chk.maybeSingle();
    if (!s) return { ok: false, error: "되돌릴 수 없는 수업이에요(담당이 아니거나 없는 수업이에요)." };
    const { count } = await sb
      .from("attendance_ledger")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (!count) return { ok: false, error: "이미 예정 상태예요." };
  }

  // 차감됐던 회차 복원 + 원장 정리(행 단위, 실패 시 원장 보존 — 감사 #17). 복원 로직은 보상 경로와 공용.
  const restored = await restoreProcessedSession(sessionId);
  if (!restored.ok) return restored;

  revalidatePath("/t");
  revalidatePath("/console");
  return { ok: true };
}
