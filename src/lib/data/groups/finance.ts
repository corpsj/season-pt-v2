import "server-only";
import { sb, nowKstParts } from "@/lib/data/db";
import { monthLabelFromKst } from "@/lib/data/kst-bounds";
import {
  CATEGORY_LABELS,
  summarizeFinance,
  type ExpenseCategory,
  type ExpenseSource,
} from "@/lib/data/finance-calc";

export interface ExpenseItem {
  id: string;
  category: ExpenseCategory;
  categoryLabel: string;
  amount: number;
  date: string;       // YYYY-MM-DD
  dateLabel: string;  // MM.DD
  note: string | null;
  source: ExpenseSource;
  trainerName?: string;
}
export interface ExpensesView {
  monthOffset: number;
  monthLabel: string;
  items: ExpenseItem[];
  byCategory: { key: ExpenseCategory; label: string; amount: number }[];
  total: number;
}
export interface FinanceSummary {
  monthOffset: number;
  monthLabel: string;
  revenue: number;
  expenseTotal: number;
  netProfit: number;
  byCategory: { key: ExpenseCategory; label: string; amount: number; pctOfRevenue: number | null }[];
  netPrev: number;
  netDeltaPct: number | null;
}

/** 대상 월 경계 문자열 + 라벨. getSettlement/getStudioOps 규약(문자열 경계). */
function monthBounds(off: number) {
  const k = nowKstParts();
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() - off, 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth(); // 0-based
  const firstThis = `${ty}-${pad(tm + 1)}-01`;
  const firstNext = tm === 11 ? `${ty + 1}-01-01` : `${ty}-${pad(tm + 2)}-01`;
  const prev = new Date(Date.UTC(ty, tm - 1, 1));
  const firstPrev = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-01`;
  return { target, firstThis, firstNext, firstPrev, monthLabel: monthLabelFromKst(target) };
}

export async function getExpenses(monthOffset = 0): Promise<ExpensesView> {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const { firstThis, firstNext, monthLabel } = monthBounds(off);

  const { data } = await sb
    .from("expenses")
    .select("id, category, amount, spent_at, note, source, trainer_id, trainers(display_name)")
    .gte("spent_at", firstThis)
    .lt("spent_at", firstNext)
    .order("spent_at", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string; category: ExpenseCategory; amount: number; spent_at: string;
    note: string | null; source: ExpenseSource; trainer_id: string | null;
    trainers: { display_name: string } | null;
  }[];

  const items: ExpenseItem[] = rows.map((r) => ({
    id: r.id,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category] ?? "기타",
    amount: r.amount,
    date: r.spent_at,
    dateLabel: `${r.spent_at.slice(5, 7)}.${r.spent_at.slice(8, 10)}`,
    note: r.note,
    source: r.source,
    trainerName: r.trainers?.display_name ?? undefined,
  }));

  const sums = new Map<ExpenseCategory, number>();
  for (const it of items) sums.set(it.category, (sums.get(it.category) ?? 0) + it.amount);
  const byCategory = [...sums.entries()]
    .filter(([, a]) => a > 0)
    .map(([key, amount]) => ({ key, label: CATEGORY_LABELS[key], amount }))
    .sort((a, b) => b.amount - a.amount);

  const total = items.reduce((s, it) => s + it.amount, 0);
  return { monthOffset: off, monthLabel, items, byCategory, total };
}

export async function getFinanceSummary(monthOffset = 0): Promise<FinanceSummary> {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const { firstThis, firstNext, firstPrev, monthLabel } = monthBounds(off);

  const sum = (rows: { amount: number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  const [{ data: payThis }, { data: payPrev }, { data: expThis }, { data: expPrev }] =
    await Promise.all([
      sb.from("payments").select("amount").gte("paid_at", firstThis).lt("paid_at", firstNext),
      sb.from("payments").select("amount").gte("paid_at", firstPrev).lt("paid_at", firstThis),
      sb.from("expenses").select("amount, category").gte("spent_at", firstThis).lt("spent_at", firstNext),
      sb.from("expenses").select("amount").gte("spent_at", firstPrev).lt("spent_at", firstThis),
    ]);

  const revenue = sum(payThis);
  const prevNet = sum(payPrev) - sum(expPrev);
  const expenses = (expThis ?? []).map((e) => ({
    category: e.category as ExpenseCategory,
    amount: e.amount as number,
  }));

  const calc = summarizeFinance({ revenue, expenses, prevNet });
  return {
    monthOffset: off,
    monthLabel,
    revenue: calc.revenue,
    expenseTotal: calc.expenseTotal,
    netProfit: calc.netProfit,
    byCategory: calc.byCategory,
    netPrev: prevNet,
    netDeltaPct: calc.netDeltaPct,
  };
}
