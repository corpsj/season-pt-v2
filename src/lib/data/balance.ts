const sumPositive = (xs: number[]) => xs.filter((a) => a > 0).reduce((s, a) => s + a, 0);

/** 미수금 = max(0, price − Σ양수결제). price null이면 0. */
export function outstanding(price: number | null, amounts: number[]): number {
  if (price == null) return 0;
  return Math.max(0, price - sumPositive(amounts));
}
export function paidInFull(price: number | null, amounts: number[]): boolean {
  if (price == null) return true;
  return sumPositive(amounts) >= price;
}
