// src/lib/data/deduction.ts
import type { AttendanceAction, StudioSettings } from "@/lib/types";

/** 차감 여부 정책. attend=항상, noshow=설정, cancel=수업까지 남은 시간이 기준시간 미만일 때만. */
export function shouldDeduct(
  action: AttendanceAction,
  scheduledAtISO: string,
  settings: StudioSettings,
  nowMs: number = Date.now(),
): boolean {
  if (action === "attend") return true;
  if (action === "noshow") return settings.noshowDeducts;
  if (settings.cancelCutoffHours <= 0) return false;
  const hoursUntil = (new Date(scheduledAtISO).getTime() - nowMs) / 3_600_000;
  return hoursUntil < settings.cancelCutoffHours;
}
