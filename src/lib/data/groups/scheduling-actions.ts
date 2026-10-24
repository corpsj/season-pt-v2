"use server";

import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { getStudioSettings } from "@/lib/data/groups/owner-ops";
import { shouldDeduct } from "@/lib/data/deduction";
import { notifyLowSessions, notifyMemberOfCounterProposal, notifyRequestResult, notifyTeamOfScheduleChange } from "@/lib/data/groups/notifications";
import { getProposeSlots, slotLabel } from "@/lib/data/groups/scheduling";
import {
  hasSlotConflict,
  moveSessionWithTombstone,
  acceptCancelRequestAtomic,
} from "@/lib/data/groups/session-mutations";
import {
  isFutureInstant,
  validateFutureSlots,
} from "@/lib/data/scheduling-guards";
import type { AttendanceAction } from "@/lib/types";

import { processClassAttendance } from "./class-workflow-actions";
import type { AttendanceOptions } from "@/lib/data/class-workflow-types";

type ActionResult = { ok: boolean; error?: string };

/** Legacy entry points share the transactional workflow; callers must send their observed version. */
export async function confirmAttendance(
  sessionId: string, action: AttendanceAction, signature?: string, options?: AttendanceOptions,
): Promise<ActionResult> {
  if (!options) return { ok: false, error: "화면을 새로고침한 뒤 다시 시도해주세요." };
  return processClassAttendance(sessionId, action, signature, options);
}

/** Trainer proposes new times: insert a pending change request. */
export async function sendPropose(
  sessionId: string,
  proposedSlots: string[],
  reason?: string,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };
  const checkedSlots = validateFutureSlots(proposedSlots);
  if (!checkedSlots.ok) return { ok: false, error: checkedSlots.error };

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
    proposed_slots: checkedSlots.slots,
  });
  if (error) return { ok: false, error: "제안을 보내지 못했어요. 다시 시도해주세요." }; // 유실을 성공으로 표시하지 않는다(감사 #37)

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  return { ok: true };
}

/**
 * 인박스 인라인 역제안용 후보 시간 온디맨드 로드(모바일 propose와 동일 게터 재사용).
 * 트레이너 컨텍스트 + 본인 담당 세션(대표는 전체)만. 비인가/미존재는 null.
 */
export async function loadTrainerProposeSlots(sessionId: string) {
  const t = await getTrainerContext();
  if (!t) return null;
  const { data: session } = await sb.from("sessions").select("trainer_id").eq("id", sessionId).maybeSingle();
  if (!session) return null;
  if (t.role !== "owner" && session.trainer_id !== t.id) return null;
  return getProposeSlots(sessionId);
}

/**
 * 회원의 변경 요청에 강사가 다른 시간을 역제안. 원 요청(pending·member 발의·본인 세션)을 rejected로
 * 정리하고 강사 발의 change 요청을 새로 insert → 회원에게 알림. 회원 측 sendMemberRequest의 역제안
 * 자동 정리(member-actions)와 대칭. 제안 단계라 세션은 움직이지 않으므로 팀 통지(notifyTeamOfScheduleChange)는 없다.
 */
export async function counterPropose(
  requestId: string,
  slotsIso: string[],
  reason?: string,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };
  const checkedSlots = validateFutureSlots(slotsIso);
  if (!checkedSlots.ok) return { ok: false, error: checkedSlots.error };

  const { data: reqRow } = await sb
    .from("schedule_change_requests")
    .select("id, session_id, requester_type, requester_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!reqRow) return { ok: false, error: "요청을 찾을 수 없어요." };
  if (reqRow.requester_type !== "member" || reqRow.status !== "pending") {
    return { ok: false, error: "이미 처리된 요청이에요." };
  }

  // 세션 상태·담당 가드(acceptRequest와 동일 스코프): 남의 수업/처리된 수업엔 역제안 불가.
  const { data: session } = await sb
    .from("sessions")
    .select("scheduled_at, status, trainer_id")
    .eq("id", reqRow.session_id)
    .maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  if (session.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요." };

  // 원자 클레임: 아직 pending일 때만 정리 — 이미 수락/거절된 요청에 역제안하지 못하게.
  const { data: claimed } = await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "이미 처리된 요청이에요." };

  const { error } = await sb.from("schedule_change_requests").insert({
    session_id: reqRow.session_id,
    requester_type: "trainer",
    requester_id: t.id,
    type: "change",
    status: "pending",
    reason: reason ?? null,
    original_at: session.scheduled_at,
    proposed_slots: checkedSlots.slots,
  });
  if (error) {
    // insert 실패 시 원 요청을 되살려 유실 방지(감사 #37 톤).
    await sb.from("schedule_change_requests").update({ status: "pending", resolved_at: null }).eq("id", requestId);
    return { ok: false, error: "제안을 보내지 못했어요. 다시 시도해주세요." };
  }

  await notifyMemberOfCounterProposal(reqRow.requester_id as string).catch(() => {}); // best-effort

  revalidatePath("/t");
  revalidatePath("/t/inbox");
  return { ok: true };
}

/**
 * 대표/담당 강사가 회원 승인 없이 수업을 새 시각으로 즉시 이동(수동 지정). 제안(sendPropose)과 달리 바로 반영된다.
 * 더블부킹 가드 + 원자적 이동(유령 방지 tombstone) 재사용. 대표가 이미 회원과 합의한 변경을 손수 반영할 때.
 */
export async function moveSessionDirect(sessionId: string, newISO: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const target = new Date(newISO);
  if (!isFutureInstant(newISO)) return { ok: false, error: "지난 시간으로는 옮길 수 없어요." };

  const { data: session } = await sb
    .from("sessions")
    .select("status, trainer_id, scheduled_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  if (session.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요." };

  if (await hasSlotConflict(session.trainer_id as string, target.toISOString(), sessionId)) {
    return { ok: false, error: "그 시간엔 이미 다른 수업이 있어요. 다른 시간을 골라주세요." };
  }

  const moved = await moveSessionWithTombstone(
    sessionId,
    session.scheduled_at as string,
    target.toISOString(),
  );
  if (!moved) return { ok: false, error: "이동에 실패했어요. 다시 시도해주세요." };

  // 대표가 직접 옮긴 경우 세션의 모든 회원에게 통지(2:1이면 두 명 다).
  await notifyTeamOfScheduleChange({ sessionId, kind: "change", detail: `→ ${slotLabel(target.toISOString())}` }).catch(() => {});

  revalidatePath("/t");
  revalidatePath("/console");
  revalidatePath("/m");
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

  const { data: req, error: requestError } = await sb
    .from("schedule_change_requests")
    .select("id, session_id, requester_id, requester_type, type, status, proposed_slots, created_at, original_at")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError || !req) return { ok: false, error: "요청을 찾을 수 없어요." };
  if (req.requester_type !== "member") return { ok: false, error: "회원이 보낸 요청만 처리할 수 있어요." };
  if (req.status !== "pending") return { ok: false, error: "이미 처리된 요청이에요." };

  // 요청 대상 세션의 현재 상태·시각·트레이너(가드/표식용).
  const { data: session, error: sessionError } = await sb
    .from("sessions")
    .select("trainer_id, type, source_schedule_id, scheduled_at, status")
    .eq("id", req.session_id)
    .maybeSingle();
  if (sessionError || !session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) {
    return { ok: false, error: "담당 수업이 아니에요." };
  }

  // 세션이 이미 출석/노쇼/취소 처리됐으면 요청 수락은 무효 → 요청을 정리(rejected)하고 알린다(감사 C1).
  if (session.status !== "scheduled") {
    await sb
      .from("schedule_change_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", req.id)
      .eq("status", "pending");
    return { ok: false, error: "이미 진행됐거나 처리된 수업이에요. 요청을 정리했어요." };
  }

  // 요청 생성 후 세션 시간이 이미 바뀌었으면(다른 요청 수락 등) 낡은 요청 — 수락하면 합의된 시간을
  // 되돌리므로 정리한다(감사 high #2 신선도 가드).
  if (req.original_at && session.scheduled_at !== req.original_at) {
    await sb
      .from("schedule_change_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", req.id)
      .eq("status", "pending");
    return { ok: false, error: "수업 시간이 이미 변경돼 요청이 만료됐어요. 요청을 정리했어요." };
  }

  let target: string | null = null;
  if (req.type === "change") {
    const slots = (req.proposed_slots as string[] | null) ?? [];
    // 회원 발의 요청은 첫 번째 제안이 수락 대상이다. 뒤쪽 대안 하나가 먼저
    // 만료됐다는 이유로 아직 유효한 첫 제안까지 함께 폐기하지 않는다.
    const checkedTarget = validateFutureSlots(slots[0] ? [slots[0]] : []);
    if (!checkedTarget.ok) {
      await sb
        .from("schedule_change_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", req.id)
        .eq("status", "pending");
      return { ok: false, error: "제안 시간이 지나 요청이 만료됐어요. 요청을 정리했어요." };
    }
    target = checkedTarget.slots[0];
    // 더블부킹 가드(감사 H6): 같은 강사·같은 시각에 다른 scheduled 세션이 있으면 거부.
    if (await hasSlotConflict(session.trainer_id as string, target, req.session_id)) {
      return { ok: false, error: "그 시간에 이미 다른 수업이 있어요." };
    }
  }

  const initiatorMemberId = req.requester_id as string;
  if (req.type === "change") {
    const moved = await moveSessionWithTombstone(
      req.session_id,
      session.scheduled_at as string,
      target!,
      req.id as string,
    );
    if (!moved) {
      return { ok: false, error: "다른 요청과 동시에 처리됐어요. 일정을 새로 확인해주세요." };
    }
    await notifyRequestResult({
      recipientType: "member",
      recipientId: req.requester_id as string,
      kind: "change",
      accepted: true,
    }).catch(() => {});
    // 2:1 팀이면 파트너에게 변경 결과 통지(무조건 함께 움직이므로).
    await notifyTeamOfScheduleChange({ sessionId: req.session_id, exceptMemberId: initiatorMemberId, kind: "change", detail: `→ ${slotLabel(target!)}` }).catch(() => {});
  } else {
    // 회원이 요청한 시점 기준으로 컷오프 판정 — 강사가 늦게 수락해도 부당 차감되지 않게(감사 C4).
    const settings = await getStudioSettings();
    const requestedMs = req.created_at ? new Date(req.created_at as string).getTime() : Date.now();
    const deducted = shouldDeduct("cancel", session.scheduled_at as string, settings, requestedMs);

    const cancelled = await acceptCancelRequestAtomic({
      requestId: req.id as string,
      sessionId: req.session_id as string,
      expectedOriginalISO: session.scheduled_at as string,
      deducted,
      createdBy: t.id,
    });
    if (!cancelled.ok) {
      return { ok: false, error: "다른 요청과 동시에 처리됐어요. 일정을 새로 확인해주세요." };
    }
    for (const deduction of cancelled.deductions) {
      await notifyLowSessions(
        deduction.membershipId,
        deduction.memberId,
        deduction.remaining,
      ).catch(() => {});
    }
    await notifyRequestResult({
      recipientType: "member",
      recipientId: req.requester_id as string,
      kind: "cancel",
      accepted: true,
    }).catch(() => {});
    // 2:1 팀이면 파트너에게 취소 통지.
    await notifyTeamOfScheduleChange({ sessionId: req.session_id, exceptMemberId: initiatorMemberId, kind: "cancel" }).catch(() => {});
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

  // 강사는 본인 담당 세션의 요청만 거절(대표는 전체). acceptRequest와 동일 스코프 —
  // 이 가드가 없으면 다른 강사 담당 회원의 요청을 거절·오알림 발송할 수 있었다(감사).
  if (t.role !== "owner") {
    const { data: pre } = await sb.from("schedule_change_requests").select("session_id").eq("id", requestId).maybeSingle();
    if (!pre) return { ok: false, error: "요청을 찾을 수 없어요." };
    const { data: s } = await sb.from("sessions").select("trainer_id").eq("id", pre.session_id).maybeSingle();
    if (s?.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  }

  const { data: rejected, error: rejectError } = await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("requester_type", "member")
    .eq("status", "pending")
    .select("id, requester_id, type");
  if (rejectError) return { ok: false, error: "요청을 처리하지 못했어요. 다시 시도해주세요." };
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
 * 인박스 열람 표식: 본인 담당 세션(대표는 getInbox와 동일하게 본인 trainer_id로 스코프)의 회원 발의 pending
 * 요청 중 seen_at 미기록 건을 now()로 일괄 기록 → 회원 '보낸 요청 내역'(M2)이 '확인함'으로 전환. best-effort,
 * 반환값 없음(렌더 경로에서 호출되므로 revalidate 안 함).
 */
export async function markInboxSeen(): Promise<void> {
  const t = await getTrainerContext();
  if (!t) return;
  const { data: sessRows } = await sb.from("sessions").select("id").eq("trainer_id", t.id);
  const sessionIds = (sessRows ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return;
  await sb
    .from("schedule_change_requests")
    .update({ seen_at: new Date().toISOString() })
    .in("session_id", sessionIds)
    .eq("requester_type", "member")
    .eq("status", "pending")
    .is("seen_at", null);
}

/**
 * 출석/노쇼/취소 오처리 되돌리기(정정). 세션을 scheduled로 원자 복구하고, 차감됐던 회차를 복원,
 * 해당 세션의 attendance_ledger를 정리한다. 앱에 정정 수단이 전무했던 문제(감사 H1). 대표 또는 담당 강사.
 */
export async function revertAttendance(sessionId: string, options?: AttendanceOptions): Promise<ActionResult> {
  if (!options) return { ok: false, error: "화면을 새로고침한 뒤 다시 시도해주세요." };
  return processClassAttendance(sessionId, "revert", undefined, options);
}
