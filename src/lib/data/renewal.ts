/** 재구매(연장): 기존 회원권에 상품의 회차·유효기간·가격을 누적한다.
 *  이 앱은 회원당 활성 회원권 1개를 전제로 하므로, 재구매는 새 행이 아니라 기존 회원권을 키운다.
 *  - 회차: 기존 잔여 + 상품 회차 (총 회차도 함께 증가)
 *  - 유효기간: 아직 유효하면 남은 기간에 이어붙이고, 만료됐으면 오늘부터 상품 기간
 *  - 가격: 기존가 + 상품가 (미수금 = price − 결제합 계산이 그대로 맞아떨어지게) */
export function computeRenewal(
  existing: { remaining_sessions: number; total_sessions: number; end_date: string; price: number | null; status: string },
  product: { sessions: number; duration_days: number; price: number },
  todayISO: string,
): { remaining_sessions: number; total_sessions: number; end_date: string; price: number; product: string; status: string } {
  const base = existing.end_date > todayISO ? existing.end_date : todayISO; // 만료됐으면 오늘부터
  const end = new Date(new Date(base + "T00:00:00Z").getTime() + product.duration_days * 86400000)
    .toISOString()
    .slice(0, 10);
  const total = existing.total_sessions + product.sessions;
  return {
    remaining_sessions: existing.remaining_sessions + product.sessions,
    total_sessions: total,
    end_date: end,
    price: (existing.price ?? 0) + product.price,
    product: String(total), // "N회권" 라벨 = 누적 총 회차
    // 일시정지 중 연장은 정지 유지(연장이 조용히 정지를 풀던 문제 방지 — extendMembership과 동일 규칙)
    status: existing.status === "paused" ? "paused" : "active",
  };
}
