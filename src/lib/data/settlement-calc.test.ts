import { test, expect } from "bun:test";
import { computePayout } from "./settlement-calc";

test("computePayout: 빈 배열은 0", () => {
  expect(computePayout([], 50_000, 30_000)).toEqual({ count1on1: 0, count2on1: 0, payout: 0 });
});

test("computePayout: 스냅샷 pay_rate 우선", () => {
  const r = computePayout([{ type: "1on1", payRate: 45_000 }], 50_000, 30_000);
  expect(r.count1on1).toBe(1);
  expect(r.payout).toBe(45_000); // 스냅샷이 현재 단가보다 우선
});

test("computePayout: pay_rate 없으면 현재 단가 폴백", () => {
  const r = computePayout([{ type: "1on1", payRate: null }], 50_000, 30_000);
  expect(r.payout).toBe(50_000);
});

test("computePayout: 2on1은 count2on1 + rate2on1 폴백", () => {
  const r = computePayout([{ type: "2on1", payRate: null }], 50_000, 30_000);
  expect(r.count2on1).toBe(1);
  expect(r.count1on1).toBe(0);
  expect(r.payout).toBe(30_000);
});

test("computePayout: 유형 혼합 + 스냅샷/폴백 혼합 합산", () => {
  const r = computePayout(
    [
      { type: "1on1", payRate: null },   // 50,000
      { type: "1on1", payRate: 40_000 }, // 40,000 (스냅샷)
      { type: "2on1", payRate: null },   // 30,000
      { type: "2on1", payRate: 25_000 }, // 25,000 (스냅샷)
    ],
    50_000,
    30_000,
  );
  expect(r.count1on1).toBe(2);
  expect(r.count2on1).toBe(2);
  expect(r.payout).toBe(145_000);
});

test("computePayout: 단가 0 + 스냅샷 없음이면 payout 0", () => {
  const r = computePayout([{ type: "1on1", payRate: null }, { type: "2on1", payRate: null }], 0, 0);
  expect(r.count1on1).toBe(1);
  expect(r.count2on1).toBe(1);
  expect(r.payout).toBe(0);
});
