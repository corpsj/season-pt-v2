import { describe, expect, test } from "bun:test";
import {
  isFutureInstant,
  isFutureKstDate,
  validateFutureSlots,
} from "./scheduling-guards";

const NOW = Date.parse("2026-07-10T04:00:00.000Z"); // 2026-07-10 13:00 KST

describe("validateFutureSlots", () => {
  test("normalizes valid future slots", () => {
    expect(validateFutureSlots(["2026-07-10T15:00:00+09:00"], NOW)).toEqual({
      ok: true,
      slots: ["2026-07-10T06:00:00.000Z"],
    });
  });

  test("rejects missing, past, duplicate, and excessive slots", () => {
    expect(validateFutureSlots([], NOW).ok).toBe(false);
    expect(validateFutureSlots(["2026-07-10T03:59:59.000Z"], NOW).ok).toBe(false);
    expect(validateFutureSlots([
      "2026-07-10T06:00:00.000Z",
      "2026-07-10T15:00:00+09:00",
    ], NOW).ok).toBe(false);
    expect(validateFutureSlots([
      "2026-07-10T06:00:00.000Z",
      "2026-07-10T07:00:00.000Z",
      "2026-07-10T08:00:00.000Z",
      "2026-07-10T09:00:00.000Z",
    ], NOW).ok).toBe(false);
  });
});

test("future instant and future KST day are separate policies", () => {
  expect(isFutureInstant("2026-07-10T05:00:00.000Z", NOW)).toBe(true);
  expect(isFutureKstDate("2026-07-10T05:00:00.000Z", NOW)).toBe(false);
  expect(isFutureKstDate("2026-07-10T15:00:00.000Z", NOW)).toBe(true);
  expect(isFutureInstant("not-a-date", NOW)).toBe(false);
});
