import { test, expect } from "bun:test";
import { summarizeFinance, settlementLaborRows } from "./finance-calc";

test("summarizeFinance: netProfit = revenue - expenses", () => {
  const r = summarizeFinance({
    revenue: 1_000_000,
    expenses: [{ category: "labor", amount: 300_000 }, { category: "rent", amount: 200_000 }],
    prevNet: 0,
  });
  expect(r.expenseTotal).toBe(500_000);
  expect(r.netProfit).toBe(500_000);
});

test("summarizeFinance: byCategory 합 = expenseTotal, 금액 내림차순", () => {
  const r = summarizeFinance({
    revenue: 1_000_000,
    expenses: [{ category: "rent", amount: 200_000 }, { category: "labor", amount: 300_000 }],
    prevNet: 0,
  });
  expect(r.byCategory.reduce((s, c) => s + c.amount, 0)).toBe(r.expenseTotal);
  expect(r.byCategory[0].key).toBe("labor");   // 큰 금액 먼저
  expect(r.byCategory[0].pctOfRevenue).toBe(30);
});

test("summarizeFinance: netDeltaPct는 prevNet<=0이면 null, >0이면 값", () => {
  expect(summarizeFinance({ revenue: 100, expenses: [], prevNet: 0 }).netDeltaPct).toBeNull();
  expect(summarizeFinance({ revenue: 200, expenses: [], prevNet: 100 }).netDeltaPct).toBe(100);
});

test("summarizeFinance: revenue 0이면 pctOfRevenue null, netProfit 음수 허용", () => {
  const r = summarizeFinance({ revenue: 0, expenses: [{ category: "etc", amount: 5000 }], prevNet: 0 });
  expect(r.byCategory[0].pctOfRevenue).toBeNull();
  expect(r.netProfit).toBe(-5000);
});

test("settlementLaborRows: owner와 payout<=0 제외", () => {
  const rows = settlementLaborRows(
    [
      { trainerId: "t1", role: "instructor", payout: 100_000 },
      { trainerId: "o1", role: "owner", payout: 50_000 },
      { trainerId: "t2", role: "instructor", payout: 0 },
    ],
    { monthKey: "2026-07", spentAt: "2026-07-31", recordedBy: "o1" },
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].trainer_id).toBe("t1");
  expect(rows[0].note).toBe("2026-07 정산");
  expect(rows[0].source).toBe("settlement");
});
