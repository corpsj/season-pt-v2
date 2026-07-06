import { test, expect } from "bun:test";
import { computeRenewal } from "./renewal";

test("valid membership: adds sessions and extends from current end_date", () => {
  const r = computeRenewal(
    { remaining_sessions: 3, total_sessions: 10, end_date: "2026-08-01", price: 700000, status: "active" },
    { sessions: 10, duration_days: 90, price: 700000 },
    "2026-07-06",
  );
  expect(r.remaining_sessions).toBe(13); // 3 잔여 + 10
  expect(r.total_sessions).toBe(20);
  expect(r.price).toBe(1400000); // 미수금 = 1,400,000 − 기결제 700,000 = 700,000
  expect(r.end_date).toBe("2026-10-30"); // 2026-08-01 + 90일 (기존 유효기간에 이어붙임)
  expect(r.product).toBe("20");
  expect(r.status).toBe("active");
});

test("expired membership: extends from today, paused stays paused", () => {
  const r = computeRenewal(
    { remaining_sessions: 0, total_sessions: 10, end_date: "2026-06-01", price: 500000, status: "paused" },
    { sessions: 5, duration_days: 30, price: 300000 },
    "2026-07-06",
  );
  expect(r.remaining_sessions).toBe(5);
  expect(r.end_date).toBe("2026-08-05"); // 만료됨 → 오늘 + 30일
  expect(r.status).toBe("paused");
});
