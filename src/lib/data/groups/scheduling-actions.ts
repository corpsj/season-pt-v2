"use server";

import { revalidatePath } from "next/cache";
import { sb, getTrainerContext } from "@/lib/data/db";
import { ensureOwner } from "@/lib/auth/guard";
import { getStudioSettings, getExercises } from "@/lib/data/groups/owner-ops";
import { shouldDeduct } from "@/lib/data/deduction";
import { notifyLowSessions, notifyMemberOfCounterProposal, notifyRequestResult, notifyTeamOfScheduleChange } from "@/lib/data/groups/notifications";
import { getProposeSlots, slotLabel, getRecordTarget, parseExercises } from "@/lib/data/groups/scheduling";
import {
  hasSlotConflict,
  moveSessionWithTombstone,
  acceptCancelRequestAtomic,
  rejectPendingRequestsForSession,
} from "@/lib/data/groups/session-mutations";
import {
  isFutureInstant,
  isFutureKstDate,
  validateFutureSlots,
} from "@/lib/data/scheduling-guards";
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
    // activeMembership이 null인 두 경우를 구분: (a) 회원권 자체가 없음 → 감사3 #11 대상으로 명시 거부.
    // (b) 활성 회원권은 있으나 잔여 0(위 필터의 gt 0) → 기존 "무료 수업으로 남김" UX 유지(attend UI 배너와 양립).
    // cancel은 회원권 없이도 기록 자체는 의미가 있으므로 기존 동작 유지.
    if (args.deducted && !ms && args.action !== "cancel") {
      const { data: anyActive } = await sb
        .from("memberships")
        .select("id")
        .eq("member_id", memberId)
        .in("status", ["active", "paused"])
        .limit(1)
        .maybeSingle();
      if (!anyActive) {
        // 2:1 팀은 누구의 회원권이 문제인지 알려야 대표가 바로 조치할 수 있다(감사 후속).
        const { data: mrow } = await sb.from("members").select("name").eq("id", memberId).maybeSingle();
        const who = mrow?.name ? `${mrow.name}님의 ` : "";
        return `${who}활성 회원권이 없어요 — 재등록/일시정지 재개를 먼저 확인해주세요.`;
      }
    }
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
      deducted: args.deducted && !!ms, // 실제 차감 여부 그대로 기록 — 잔여 0(무료 수업) 케이스는 ms=null → false(감사3 #11)
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
    .update({ status: "scheduled", pay_rate: null, member_signature: null, signed_at: null })
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
  signature?: string,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  // 수업 완료 회원 확인 서명(신뢰 경계 검증): 출석은 서명이 필수이며 작은 PNG data URL만 허용.
  if (action === "attend" && !signature) {
    return { ok: false, error: "회원 확인 서명을 받아야 출석 처리할 수 있어요." };
  }
  if (signature != null && (!signature.startsWith("data:image/png;base64,") || signature.length > 200_000)) {
    return { ok: false, error: "서명 데이터가 올바르지 않아요. 다시 서명해주세요." };
  }

  // UI를 우회해 미래 날짜 수업을 미리 차감하지 못하게 서버에서 다시 확인한다.
  // 같은 KST 날짜 안에서는 운영 편의를 위해 수업 시작 전 처리도 허용한다.
  const { data: preflight, error: preflightError } = await sb
    .from("sessions")
    .select("status, trainer_id, scheduled_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (preflightError || !preflight) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && preflight.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };
  if (preflight.status !== "scheduled") return { ok: false, error: "이미 처리된 수업이에요" };
  if (isFutureKstDate(preflight.scheduled_at as string)) {
    return { ok: false, error: "출석 처리는 수업 당일부터 할 수 있어요." };
  }

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
    .update({
      status: statusMap[action],
      ...(action === "attend" && signature ? { member_signature: signature, signed_at: new Date().toISOString() } : {}),
    })
    .eq("id", sessionId)
    .eq("status", "scheduled");
  if (t.role !== "owner") claimQ = claimQ.eq("trainer_id", t.id);
  const { data: claimed } = await claimQ.select("scheduled_at, trainer_id, type");
  if (!claimed || claimed.length === 0) {
    // 원인 구분: 이미 처리된 수업(재시도/이중탭) vs 남의 수업 — 뭉뚱그린 문구가 재시도 사용자를 오해시킴(감사3 #22)
    const { data: s } = await sb.from("sessions").select("status, trainer_id").eq("id", sessionId).maybeSingle();
    if (s && s.status !== "scheduled" && (t.role === "owner" || s.trainer_id === t.id)) {
      return { ok: false, error: "이미 처리된 수업이에요" };
    }
    return { ok: false, error: "담당 수업이 아니에요" };
  }
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

/** 콘솔 캘린더 수업 기록 모달용: 기존 기록 프리로드 + 종목 옵션을 함께 로드(대표 전용 래퍼). */
export async function loadRecordTarget(sessionId: string) {
  if (!(await ensureOwner())) return null;
  const [target, exercises] = await Promise.all([getRecordTarget(sessionId), getExercises()]);
  return { target, exerciseOptions: exercises.map((e) => e.name) };
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
    // upsert: (session_id, member_id) 기존 최신 1행이 있으면 갱신, 없으면 삽입 — 수정 모드에서
    // 매번 새 행이 쌓여 세션당 기록이 중복되던 문제 방지. insert/update 오류는 삼키지 않는다(감사 H10).
    const { data: existing } = await sb
      .from("workout_records")
      .select("id")
      .eq("session_id", sessionId)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await sb
        .from("workout_records")
        .update({ exercises, comment: comment ?? null })
        .eq("id", existing.id);
      if (error) return { ok: false, error: "기록 저장에 실패했어요. 다시 시도해주세요." };
    } else {
      const { error } = await sb.from("workout_records").insert({
        session_id: sessionId,
        member_id: memberId,
        exercises,
        comment: comment ?? null,
        created_by: t.id,
      });
      if (error) return { ok: false, error: "기록 저장에 실패했어요. 다시 시도해주세요." };
    }
  }

  revalidatePath("/t");
  revalidatePath(`/t/class/${sessionId}`); // 허브 복귀 시 최신 기록 반영
  revalidatePath("/m"); // 회원 캘린더 날짜별 운동 기록
  revalidatePath("/m/my/records");
  return { ok: true };
}

/**
 * 이 세션 회원의 '직전 다른 세션' 운동 기록을 불러온다(프리필용). comment는 제외 — 종목·kg·sets·reps만.
 * 트레이너 컨텍스트 + 담당 세션 가드(saveRecord와 동일). 이전 기록이 없으면 exercises=[].
 */
export async function loadPrevRecord(
  sessionId: string,
): Promise<{ ok: boolean; exercises?: WorkoutExercise[]; error?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: session } = await sb.from("sessions").select("trainer_id").eq("id", sessionId).maybeSingle();
  if (!session) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && session.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };

  const memberId = (await memberIdsForSession(sessionId))[0];
  if (!memberId) return { ok: false, error: "회원을 찾을 수 없어요." };

  const { data } = await sb
    .from("workout_records")
    .select("exercises")
    .eq("member_id", memberId)
    .neq("session_id", sessionId) // 직전 '다른' 세션
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { ok: true, exercises: data ? parseExercises(data.exercises) : [] };
}

/** 세션의 운동 기록 삭제(세션 전 회원). 담당 가드 후 (session_id, member_id들) 행 제거. */
export async function deleteRecord(sessionId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  const { data: target } = await sb.from("sessions").select("trainer_id").eq("id", sessionId).maybeSingle();
  if (!target) return { ok: false, error: "수업을 찾을 수 없어요." };
  if (t.role !== "owner" && target.trainer_id !== t.id) return { ok: false, error: "담당 수업이 아니에요." };

  const memberIds = await memberIdsForSession(sessionId);
  const { error } = await sb
    .from("workout_records")
    .delete()
    .eq("session_id", sessionId)
    .in("member_id", memberIds);
  if (error) return { ok: false, error: "기록 삭제에 실패했어요. 다시 시도해주세요." };

  revalidatePath("/t");
  revalidatePath(`/t/class/${sessionId}`);
  revalidatePath("/m");
  revalidatePath("/m/my/records");
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
export async function revertAttendance(sessionId: string): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };

  // 원자 클레임: 처리된(attended/noshow/cancelled) 세션만 scheduled로 되돌린다. 서명도 무효화.
  let claimQ = sb
    .from("sessions")
    .update({ status: "scheduled", pay_rate: null, member_signature: null, signed_at: null })
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
