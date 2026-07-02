import { test, expect } from "bun:test";
import { parseEndDate } from "./carryover-parse";

test("parseEndDate: 다양한 표기 → YYYY-MM-DD, 존재하지 않는 날짜 거부", () => {
  expect(parseEndDate("2026-08-31")).toBe("2026-08-31");
  expect(parseEndDate("2026.08.31")).toBe("2026-08-31");
  expect(parseEndDate("260831")).toBe("2026-08-31");
  expect(parseEndDate("2026/08/31")).toBe("2026-08-31");
  expect(parseEndDate("2026-13-01")).toBe(null); // 잘못된 월
  expect(parseEndDate("2026-02-30")).toBe(null); // 존재하지 않는 날짜(라운드트립)
  expect(parseEndDate("2026-04-31")).toBe(null);
  expect(parseEndDate("2025-02-29")).toBe(null); // 평년
  expect(parseEndDate("2024-02-29")).toBe("2024-02-29"); // 윤년
  expect(parseEndDate("abc")).toBe(null);
});
