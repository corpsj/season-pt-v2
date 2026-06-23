import { test, expect } from "bun:test";
import { monthBoundsFromKst, weekBoundsFromKst, monthLabelFromKst } from "./kst-bounds";

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
