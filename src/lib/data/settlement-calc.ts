// 순수 정산 계산 — server-only/DB 의존 없음(bun:test 대상). getSettlement 등이 조합해 씀.

export interface PayoutSession {
  type: string;
  payRate: number | null; // 진행 시점 스냅샷 단가(있으면 우선)
}
export interface PayoutResult {
  count1on1: number;
  count2on1: number;
  payout: number;
}

/**
 * 강사 한 명의 attended 세션들을 유형별로 세고 회당 정산액을 합산.
 * 규칙(불변): 스냅샷 pay_rate가 있으면 그 값, 없으면 현재 단가(1:1 → rate1on1 / 2:1 → rate2on1) 폴백.
 */
export function computePayout(
  sessions: PayoutSession[],
  rate1on1: number,
  rate2on1: number,
): PayoutResult {
  let count1on1 = 0;
  let count2on1 = 0;
  let payout = 0;
  for (const s of sessions) {
    const isTeam = s.type === "2on1";
    if (isTeam) count2on1++;
    else count1on1++;
    payout += s.payRate ?? (isTeam ? rate2on1 : rate1on1);
  }
  return { count1on1, count2on1, payout };
}
