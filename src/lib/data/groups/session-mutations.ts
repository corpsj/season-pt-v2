import "server-only";
import { sb } from "@/lib/data/db";
import { teamMembersError, normalizeTeamSlots, type Slot } from "@/lib/data/team-slots";

/**
 * 세션 이동/취소의 원자적·유령방지 로직. 강사 인박스(scheduling-actions)와 회원 수신(member-actions)
 * 양쪽이 같은 규칙을 쓰도록 한 곳에 둔다. "use server"가 아니라 server-only 헬퍼 — 액션에서 재사용.
 */

/**
 * 강사의 겹치는 scheduled 세션 존재 여부(더블부킹 가드, 감사 H6). 자기 세션은 제외.
 * 수업은 60분 — 정확히 같은 시각만 보면 30분 어긋난 겹침이 통과하므로 |차이| < 60분을 겹침으로 본다.
 */
export async function hasSlotConflict(trainerId: string, atISO: string, exceptSessionId: string): Promise<boolean> {
  const t = new Date(atISO).getTime();
  if (Number.isNaN(t)) return true; // 잘못된 시각은 예약 불가로 취급
  const lo = new Date(t - 3599999).toISOString(); // ponytail: 60분 고정 수업 길이 가정
  const hi = new Date(t + 3599999).toISOString();
  const { data } = await sb
    .from("sessions")
    .select("id")
    .eq("trainer_id", trainerId)
    .gte("scheduled_at", lo)
    .lte("scheduled_at", hi)
    .eq("status", "scheduled")
    .neq("id", exceptSessionId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * 세션의 남은 pending 변경/취소 요청 일괄 정리(rejected). 세션이 이동·취소·출석 확정된 뒤에도
 * 낡은 요청이 살아남아 뒤늦게 수락되면 이미 합의된 세션을 다시 움직인다(감사 high #2) — 상태 전이 지점에서 항상 호출.
 */
export async function rejectPendingRequestsForSession(sessionId: string): Promise<void> {
  await sb
    .from("schedule_change_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "pending");
}

/**
 * 세션을 새 시각으로 이동(원자적 scheduled 클레임) + 원래 슬롯에 cancelled 표식 세션을 남긴다.
 * generateUpcomingSessions의 dedup 키가 (source_schedule_id, scheduled_at)라, 표식이 없으면
 * 비워진 원래 슬롯에 '유령 세션'이 매주 재생성된다(감사 C3). 성공 시 true, 이미 처리됐으면 false.
 */
export async function moveSessionWithTombstone(sessionId: string, newISO: string): Promise<boolean> {
  const { data: cur } = await sb
    .from("sessions")
    .select("trainer_id, type, source_schedule_id, scheduled_at, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!cur || cur.status !== "scheduled") return false;
  const originalAt = cur.scheduled_at as string;

  // 목적지에 남아있던 '멤버 없는' 표식 세션은 회수 — 되돌아오는 이동이 (source_schedule_id, scheduled_at)
  // unique 백스톱(0017)에 걸리지 않게. 멤버가 있는 진짜 취소 세션은 기록이므로 건드리지 않는다.
  let removedTombs: { trainer_id: string; scheduled_at: string; type: string; source_schedule_id: string }[] = [];
  if (cur.source_schedule_id) {
    const { data: marks } = await sb
      .from("sessions")
      .select("id, trainer_id, scheduled_at, type, source_schedule_id, session_members(member_id)")
      .eq("source_schedule_id", cur.source_schedule_id)
      .eq("scheduled_at", newISO)
      .eq("status", "cancelled")
      .neq("id", sessionId);
    const tombs = (marks ?? []).filter(
      (m) => !(m as unknown as { session_members?: unknown[] }).session_members?.length,
    );
    if (tombs.length) {
      removedTombs = tombs.map((m) => ({
        trainer_id: m.trainer_id as string,
        scheduled_at: m.scheduled_at as string,
        type: m.type as string,
        source_schedule_id: m.source_schedule_id as string,
      }));
      await sb.from("sessions").delete().in("id", tombs.map((m) => m.id as string));
    }
  }

  const { data: claimed } = await sb
    .from("sessions")
    .update({ scheduled_at: newISO })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id");
  if (!claimed || claimed.length === 0) {
    // 이동 실패 — 회수했던 표식을 되살려 유령 세션 재생성을 막는다.
    if (removedTombs.length) await sb.from("sessions").insert(removedTombs.map((r) => ({ ...r, status: "cancelled" })));
    return false;
  }

  // 이동 확정 — 이 세션의 다른 pending 요청은 낡았으므로 정리(감사 high #2).
  await rejectPendingRequestsForSession(sessionId);

  if (cur.source_schedule_id) {
    await sb.from("sessions").insert({
      trainer_id: cur.trainer_id,
      scheduled_at: originalAt,
      type: cur.type,
      status: "cancelled",
      source_schedule_id: cur.source_schedule_id,
    });
  }
  return true;
}

/**
 * 2:1 팀 정기 스케줄 생성(server-only). 두 회원을 같은 강사의 2on1 스케줄에 묶는다.
 * 회원 등록·콘솔 "팀 만들기" 양쪽이 재사용. 대표 가드는 호출 액션에서 이미 적용된다.
 * 슬롯은 all-or-nothing으로 사전 검증(더블부킹) 후 생성 — 반쪽 팀을 남기지 않는다.
 */
export async function buildTeamSchedule(
  trainerId: string,
  memberIds: string[],
  slots: Slot[],
): Promise<{ ok: boolean; error?: string; warn?: string }> {
  const memErr = teamMembersError(memberIds);
  if (memErr) return { ok: false, error: memErr };
  const norm = normalizeTeamSlots(slots);
  if ("error" in norm) return { ok: false, error: norm.error };

  // 두 회원 모두 이 강사에게 배정돼 있어야 팀 세션(강사 단위)이 성립한다.
  const { data: mtRows } = await sb
    .from("member_trainers")
    .select("member_id")
    .eq("trainer_id", trainerId)
    .in("member_id", memberIds);
  const linked = new Set((mtRows ?? []).map((r) => r.member_id as string));
  if (!memberIds.every((id) => linked.has(id))) {
    return { ok: false, error: "두 회원의 담당 강사가 같아야 팀으로 묶을 수 있어요. 담당 강사를 먼저 맞춰주세요." };
  }

  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  // 사전 더블부킹 가드: 강사가 같은 요일·시각에 이미 활성 스케줄을 가지면 거부(부분 생성 방지).
  for (const s of norm.slots) {
    const { data: clash } = await sb
      .from("schedules")
      .select("id")
      .eq("trainer_id", trainerId)
      .eq("active", true)
      .eq("weekday", s.weekday)
      .eq("hour", s.hour)
      .eq("minute", s.minute)
      .limit(1)
      .maybeSingle();
    if (clash) {
      return { ok: false, error: `${WD[s.weekday]} ${s.hour}시${s.minute ? " " + s.minute + "분" : ""}에 이미 다른 수업이 있어요. 다른 시간을 선택해주세요.` };
    }
  }

  let warn: string | undefined;
  for (const s of norm.slots) {
    const { data: sched, error: schedErr } = await sb
      .from("schedules")
      .insert({ trainer_id: trainerId, type: "2on1", weekday: s.weekday, hour: s.hour, minute: s.minute, active: true })
      .select("id")
      .single();
    if (schedErr || !sched) { warn = "일부 팀 일정 생성에 실패했어요. 다시 시도해주세요."; continue; }
    const { error: linkErr } = await sb
      .from("schedule_members")
      .insert(memberIds.map((mid) => ({ schedule_id: sched.id, member_id: mid })));
    if (linkErr) {
      await sb.from("schedules").delete().eq("id", sched.id); // 회원 없는 스케줄 잔류 방지
      warn = "일부 팀 일정 생성에 실패했어요. 다시 시도해주세요.";
    }
  }
  return { ok: true, warn };
}

/** scheduled 세션을 원자적으로 cancelled로 클레임(차감은 호출부 정책). 이미 처리됐으면 false. */
export async function claimCancelSession(sessionId: string): Promise<boolean> {
  const { data } = await sb
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id");
  const ok = !!data && data.length > 0;
  if (ok) await rejectPendingRequestsForSession(sessionId); // 취소된 세션의 낡은 요청 정리(감사 high #2)
  return ok;
}

/**
 * 회원의 1:1 정기 스케줄을 중지(환불·비활성 시 세션 생성 중단). 2:1은 다른 회원이 있어 건드리지 않는다.
 * server-only 헬퍼 — 대표 가드는 호출하는 액션에서 이미 걸림("use server"로 내보내면 가드 없는 액션이 됨).
 */
export async function deactivateSoloSchedules(memberId: string): Promise<void> {
  const { data: sm } = await sb
    .from("schedule_members")
    .select("schedule_id, schedules(type)")
    .eq("member_id", memberId);
  const ids = (sm ?? [])
    .filter((r) => (r as unknown as { schedules?: { type: string } }).schedules?.type === "1on1")
    .map((r) => r.schedule_id as string);
  if (ids.length) await sb.from("schedules").update({ active: false }).in("id", ids);
}
