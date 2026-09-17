/**
 * Pure validation shared by trainer/member scheduling actions. Keep the trust
 * boundary on the server: client date pickers are guidance, not authorization.
 */
export const MAX_PROPOSED_SLOTS = 3;

export type FutureSlotsResult =
  | { ok: true; slots: string[] }
  | { ok: false; error: string };

export function isFutureInstant(value: string, nowMs = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

/** True only when the session is on a later KST calendar day. */
export function isFutureKstDate(value: string, nowMs = Date.now()): boolean {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const offset = 9 * 60 * 60 * 1000;
  const sessionDate = new Date(timestamp + offset).toISOString().slice(0, 10);
  const today = new Date(nowMs + offset).toISOString().slice(0, 10);
  return sessionDate > today;
}

export function validateFutureSlots(
  values: readonly string[] | null | undefined,
  nowMs = Date.now(),
): FutureSlotsResult {
  if (!values?.length) return { ok: false, error: "제안할 시간을 선택해주세요." };
  if (values.length > MAX_PROPOSED_SLOTS) {
    return { ok: false, error: `시간은 최대 ${MAX_PROPOSED_SLOTS}개까지 제안할 수 있어요.` };
  }

  const slots: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return { ok: false, error: "선택한 시간이 올바르지 않아요." };
    if (timestamp <= nowMs) return { ok: false, error: "지난 시간은 제안할 수 없어요. 다른 시간을 선택해주세요." };
    const normalized = new Date(timestamp).toISOString();
    if (seen.has(normalized)) return { ok: false, error: "같은 시간이 중복되어 있어요." };
    seen.add(normalized);
    slots.push(normalized);
  }

  return { ok: true, slots };
}
