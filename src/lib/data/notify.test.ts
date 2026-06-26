import { test, expect } from "bun:test";
import { isLowSessions, isExpiringSoon } from "./notify";

test("잔여 3 이하 low", () => {
  expect(isLowSessions(3)).toBe(true);
  expect(isLowSessions(4)).toBe(false);
});

test("만료 7일 이내(0이상) 임박", () => {
  expect(isExpiringSoon(7)).toBe(true);
  expect(isExpiringSoon(8)).toBe(false);
  expect(isExpiringSoon(-1)).toBe(false);
});
