/** 중도 환불액. 결제합계 − 사용회차×1회정상가 − 결제합계×위약금율(10%). */
export function computeRefund(input: {
  paidSum: number; totalSessions: number; remainingSessions: number; listUnitPrice: number; penaltyRate?: number;
}) {
  const used = input.totalSessions - input.remainingSessions;
  const deduction = used * input.listUnitPrice;
  const penalty = Math.round(input.paidSum * (input.penaltyRate ?? 0.1));
  const refund = Math.max(0, input.paidSum - deduction - penalty);
  return { used, deduction, penalty, refund };
}
