import "server-only";
import { sb, todayISO } from "@/lib/data/db";
import { kstSlotInstant } from "@/lib/data/kst-bounds";

/**
 * Background lifecycle upkeep that has no other trigger in this stack (no cron/queue):
 *  - flip membership active→expired once end_date passes
 *  - materialize concrete `sessions` from recurring `schedules` for the next few weeks
 *
 * Called best-effort on owner dashboard loads (mobile /t and PC /console), the same
 * pattern as scanExpiringMemberships. Idempotent and cheap; move to pg_cron if the
 * studio grows. ponytail: home-load trigger, cron seam noted.
 */

/** active 회원권 중 만료일이 지난 것을 expired로 전이. 표시/집계가 만료자를 활성으로 세지 않도록. */
export async function flipExpiredMemberships(): Promise<{ flipped: number }> {
  const { data } = await sb
    .from("memberships")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("end_date", todayISO())
    .select("id");
  return { flipped: (data ?? []).length };
}

/** 반복 스케줄 → 향후 `weeks`주 구간의 구체 세션 materialize. (source_schedule_id, scheduled_at) 기준 dedup. */
export async function generateUpcomingSessions(weeks = 4): Promise<{ created: number }> {
  // active 스케줄 + 그 멤버
  const { data: scheds } = await sb
    .from("schedules")
    .select("id, trainer_id, type, weekday, hour, minute, schedule_members(member_id)")
    .eq("active", true);
  const schedules = (scheds ?? [])
    .map((s) => ({
      id: s.id as string,
      trainerId: s.trainer_id as string,
      type: s.type as string,
      weekday: s.weekday as number,
      hour: s.hour as number,
      minute: (s.minute as number) ?? 0,
      memberIds: ((s.schedule_members as { member_id: string }[] | null) ?? []).map((m) => m.member_id),
    }))
    .filter((s) => s.memberIds.length > 0);
  if (schedules.length === 0) return { created: 0 };

  const byWeekday = new Map<number, typeof schedules>();
  for (const s of schedules) {
    const arr = byWeekday.get(s.weekday) ?? [];
    arr.push(s);
    byWeekday.set(s.weekday, arr);
  }

  // 생성 후보 슬롯 만들기 (KST 달력일 순회 → 해당일 weekday의 스케줄을 실제 UTC instant로)
  const [Y0, M0, D0] = todayISO().split("-").map(Number);
  const baseUtc = Date.UTC(Y0, M0 - 1, D0);
  type Slot = { schedId: string; trainerId: string; type: string; at: Date; memberIds: string[] };
  const slots: Slot[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(baseUtc + i * 86400000);
    const wd = d.getUTCDay(); // KST 달력일의 요일 (0=일)
    const todays = byWeekday.get(wd);
    if (!todays) continue;
    for (const s of todays) {
      const at = kstSlotInstant(d, s.hour, s.minute);
      slots.push({ schedId: s.id, trainerId: s.trainerId, type: s.type, at, memberIds: s.memberIds });
    }
  }
  if (slots.length === 0) return { created: 0 };

  // 기존 세션 dedup (epoch 기준 — ISO 포맷 차이에 안전)
  const startInstant = new Date(baseUtc - 86400000).toISOString(); // 어제부터 넉넉히
  const { data: existing } = await sb
    .from("sessions")
    .select("source_schedule_id, scheduled_at")
    .in("source_schedule_id", schedules.map((s) => s.id))
    .gte("scheduled_at", startInstant);
  const seen = new Set((existing ?? []).map((r) => `${r.source_schedule_id}|${new Date(r.scheduled_at as string).getTime()}`));

  const fresh = slots.filter((s) => !seen.has(`${s.schedId}|${s.at.getTime()}`));
  if (fresh.length === 0) return { created: 0 };

  const { data: inserted } = await sb
    .from("sessions")
    .insert(fresh.map((s) => ({
      trainer_id: s.trainerId,
      scheduled_at: s.at.toISOString(),
      type: s.type,
      status: "scheduled",
      source_schedule_id: s.schedId,
    })))
    .select("id, source_schedule_id, scheduled_at");

  // 새 세션마다 멤버 연결
  const memberRows: { session_id: string; member_id: string }[] = [];
  for (const row of inserted ?? []) {
    const slot = fresh.find((s) => s.schedId === row.source_schedule_id && s.at.getTime() === new Date(row.scheduled_at as string).getTime());
    if (!slot) continue;
    for (const mid of slot.memberIds) memberRows.push({ session_id: row.id as string, member_id: mid });
  }
  if (memberRows.length > 0) await sb.from("session_members").insert(memberRows);

  return { created: (inserted ?? []).length };
}

/** 대표 대시보드 로드 시 best-effort 유지보수: 만료 전이 → 세션 생성. */
export async function runStudioMaintenance(): Promise<void> {
  await flipExpiredMemberships().catch(() => {});
  await generateUpcomingSessions().catch(() => {});
}
