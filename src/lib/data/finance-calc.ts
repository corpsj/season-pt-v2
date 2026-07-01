// 순수 재무 계산 — server-only/DB 의존 없음(bun:test 대상). 게터·액션이 조합해 씀.

export const CATEGORY_LABELS = {
  labor: "인건비",
  rent: "임대료",
  utility: "공과금",
  marketing: "마케팅",
  supply: "소모품·장비",
  etc: "기타",
} as const;
export type ExpenseCategory = keyof typeof CATEGORY_LABELS;
export type ExpenseSource = "manual" | "settlement" | "incentive";

export interface FinanceInput {
  revenue: number;
  expenses: { category: ExpenseCategory; amount: number }[];
  prevNet: number;
}
export interface FinanceByCategory {
  key: ExpenseCategory;
  label: string;
  amount: number;
  pctOfRevenue: number | null;
}
export interface FinanceSummaryCalc {
  revenue: number;
  expenseTotal: number;
  netProfit: number;
  byCategory: FinanceByCategory[];
  netDeltaPct: number | null;
}

export function summarizeFinance(input: FinanceInput): FinanceSummaryCalc {
  const { revenue, expenses, prevNet } = input;
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = revenue - expenseTotal;

  const sums = new Map<ExpenseCategory, number>();
  for (const e of expenses) sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  const byCategory: FinanceByCategory[] = [...sums.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => ({
      key,
      label: CATEGORY_LABELS[key],
      amount,
      pctOfRevenue: revenue > 0 ? Math.round((amount / revenue) * 100) : null,
    }))
    .sort((a, b) => b.amount - a.amount);

  const netDeltaPct = prevNet > 0 ? Math.round(((netProfit - prevNet) / prevNet) * 100) : null;
  return { revenue, expenseTotal, netProfit, byCategory, netDeltaPct };
}

// settlement.ts의 SettlementRow가 이 구조를 구조적으로 만족(server-only import 회피 → 테스트 안전).
export interface LaborInput {
  trainerId: string;
  role: string;
  payout: number;
}
export interface LaborRow {
  category: "labor";
  source: "settlement";
  trainer_id: string;
  settle_month: string;
  amount: number;
  spent_at: string;
  note: string;
  recorded_by: string;
}
export function settlementLaborRows(
  rows: LaborInput[],
  opts: { monthKey: string; spentAt: string; recordedBy: string },
): LaborRow[] {
  return rows
    .filter((r) => r.payout > 0 && r.role !== "owner")
    .map((r) => ({
      category: "labor",
      source: "settlement",
      trainer_id: r.trainerId,
      settle_month: opts.monthKey,
      amount: r.payout,
      spent_at: opts.spentAt,
      note: `${opts.monthKey} 정산`,
      recorded_by: opts.recordedBy,
    }));
}
