import { test, expect } from "bun:test";
import { monthBoundsFromKst, weekBoundsFromKst, monthLabelFromKst, kstSlotInstant, dayBoundsFromKst } from "./kst-bounds";

// KST 2026-06-23 (화요일) 12:00 — getUTC* 필드가 KST 벽시계로 읽히는 Date.
const kst = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

test("weekBoundsFromKst → 그 주의 월~토 (KST), 실제 UTC instant", () => {
  const { startISO, endISO } = weekBoundsFromKst(kst);
  expect(startISO).toBe("2026-06-21T15:00:00.000Z"); // 월 2026-06-22 00:00 KST
  expect(endISO).toBe("2026-06-27T15:00:00.000Z");   // 일 2026-06-28 00:00 KST (월~토 끝)
});

test("monthBoundsFromKst → 2026년 6월 경계 (UTC)", () => {
  const { startISO, endISO } = monthBoundsFromKst(kst);
  expect(startISO).toBe("2026-05-31T15:00:00.000Z"); // 2026-06-01 00:00 KST
  expect(endISO).toBe("2026-06-30T15:00:00.000Z");   // 2026-07-01 00:00 KST
});

test("monthLabelFromKst → '2026년 6월'", () => {
  expect(monthLabelFromKst(kst)).toBe("2026년 6월");
});

// 세션 생성기: 반복 스케줄의 KST 시:분이 실제 UTC instant로 정확히 변환되는지(회차/매출 직결).
test("kstSlotInstant: 2026-07-01(수) 21:30 KST → UTC 12:30", () => {
  const day = new Date(Date.UTC(2026, 6, 1)); // KST 달력일
  expect(kstSlotInstant(day, 21, 30).toISOString()).toBe("2026-07-01T12:30:00.000Z");
});

test("kstSlotInstant: 07:00 KST는 UTC 전날 22:00이지만 KST 날짜는 유지", () => {
  const day = new Date(Date.UTC(2026, 6, 1));
  expect(kstSlotInstant(day, 7, 0).toISOString()).toBe("2026-06-30T22:00:00.000Z");
});

// 세션 하루치 식단 경계: KST 그날 00:00 = 전날 15:00Z, 끝 = 그날 15:00Z (다음날 00:00 KST).
test("dayBoundsFromKst: 2026-07-03 → [07-02 15:00Z, 07-03 15:00Z)", () => {
  const { startISO, endISO } = dayBoundsFromKst("2026-07-03");
  expect(startISO).toBe("2026-07-02T15:00:00.000Z");
  expect(endISO).toBe("2026-07-03T15:00:00.000Z");
});

test("dayBoundsFromKst: 월말 경계 2026-07-31 → 다음날은 08-01 00:00 KST", () => {
  const { startISO, endISO } = dayBoundsFromKst("2026-07-31");
  expect(startISO).toBe("2026-07-30T15:00:00.000Z");
  expect(endISO).toBe("2026-07-31T15:00:00.000Z"); // 2026-08-01 00:00 KST
});
