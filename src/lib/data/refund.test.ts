import { test, expect } from "bun:test";
import { computeRefund } from "./refund";

test("환불 = 결제 − 사용회차×정상가 − 결제×10%", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 5, listUnitPrice: 150000 }))
    .toEqual({ used: 3, deduction: 450000, penalty: 100000, refund: 450000 });
});
test("음수면 0 clamp", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 0, listUnitPrice: 150000 }).refund).toBe(0);
});
test("사용 0회 = 위약금만", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 8, listUnitPrice: 150000 }))
    .toEqual({ used: 0, deduction: 0, penalty: 100000, refund: 900000 });
});
