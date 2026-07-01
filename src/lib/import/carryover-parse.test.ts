import { test, expect } from "bun:test";
import { parseSlots, parseEndDate, parseCarryoverCsv } from "./carryover-parse";

test("parseSlots: 요일·시각·분(0/30) 파싱, 구분자 다양", () => {
  expect(parseSlots("월 19:00 / 수 20:30")).toEqual([
    { weekday: 1, hour: 19, minute: 0 },
    { weekday: 3, hour: 20, minute: 30 },
  ]);
  expect(parseSlots("화9, 목9")).toEqual([
    { weekday: 2, hour: 9, minute: 0 },
    { weekday: 4, hour: 9, minute: 0 },
  ]);
  expect(parseSlots("수 19:45")).toEqual([{ weekday: 3, hour: 19, minute: 30 }]); // 45 → 30 스냅
  expect(parseSlots("")).toEqual([]);
  expect(parseSlots("월 25")).toEqual([]); // 시각 범위 밖
});

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

test("parseCarryoverCsv: 헤더 스킵 + 유효/오류 판정", () => {
  const csv = [
    "이름,연락처,생년월일,성별,상품명,잔여횟수,만료일,정기일정,담당강사",
    "김서연,010-1234-5678,920101,여,1:1 PT 20회권,7,2026-08-31,월 19:00 / 수 19:00,박지훈",
    "박민수,010-2222-3333,880303,남,1:1 PT 10회권,3,2026-07-15,화 07:00,",
    ",010-0000-0000,900101,남,10회권,5,2026-09-01,,", // 이름 없음
    "오류,010-9,900101,남,10회권,5,2026-09-01,,", // 연락처 오류
    "만료오류,010-1234-0000,900101,여,10회권,5,없음,,", // 만료일 오류
  ].join("\n");
  const rows = parseCarryoverCsv(csv);
  expect(rows.length).toBe(5);
  expect(rows[0].valid).toBe(true);
  expect(rows[0].gender).toBe("female");
  expect(rows[0].remaining).toBe(7);
  expect(rows[0].endDate).toBe("2026-08-31");
  expect(rows[0].slots).toEqual([{ weekday: 1, hour: 19, minute: 0 }, { weekday: 3, hour: 19, minute: 0 }]);
  expect(rows[0].trainerName).toBe("박지훈");
  expect(rows[1].valid).toBe(true);
  expect(rows[1].trainerName).toBe(null);
  expect(rows[2].reason).toBe("이름 없음");
  expect(rows[3].reason).toBe("연락처 오류");
  expect(rows[4].reason).toBe("만료일 오류");
});
