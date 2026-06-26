import { test, expect } from "bun:test";
import { outstanding, paidInFull } from "./balance";

test("미수금 = 가격 − 양수 결제 합계", () => {
  expect(outstanding(1300000, [1000000])).toBe(300000);
});
test("음수(환불) 결제는 제외, 완납/과납은 0", () => {
  expect(outstanding(1300000, [1300000, -500000])).toBe(0);
  expect(outstanding(1000000, [1200000])).toBe(0);
});
test("price null이면 0", () => {
  expect(outstanding(null, [])).toBe(0);
});
test("paidInFull", () => {
  expect(paidInFull(1000000, [600000])).toBe(false);
  expect(paidInFull(1000000, [600000, 400000])).toBe(true);
});
