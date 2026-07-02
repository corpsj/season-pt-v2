import "server-only";
import { sb } from "@/lib/data/db";

/**
 * 세션 이동/취소의 원자적·유령방지 로직. 강사 인박스(scheduling-actions)와 회원 수신(member-actions)
 * 양쪽이 같은 규칙을 쓰도록 한 곳에 둔다. "use server"가 아니라 server-only 헬퍼 — 액션에서 재사용.
 */

/** 강사의 같은 시각 다른 scheduled 세션 존재 여부(더블부킹 가드, 감사 H6). 자기 세션은 제외. */
export async function hasSlotConflict(trainerId: string, atISO: string, exceptSessionId: string): Promise<boolean> {
  const { data } = await sb
    .from("sessions")
    .select("id")
    .eq("trainer_id", trainerId)
    .eq("scheduled_at", atISO)
    .eq("status", "scheduled")
    .neq("id", exceptSessionId)
    .limit(1)
    .maybeSingle();
  return !!data;
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

  const { data: claimed } = await sb
    .from("sessions")
    .update({ scheduled_at: newISO })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id");
  if (!claimed || claimed.length === 0) return false;

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

/** scheduled 세션을 원자적으로 cancelled로 클레임(차감은 호출부 정책). 이미 처리됐으면 false. */
export async function claimCancelSession(sessionId: string): Promise<boolean> {
  const { data } = await sb
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "scheduled")
    .select("id");
  return !!data && data.length > 0;
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
