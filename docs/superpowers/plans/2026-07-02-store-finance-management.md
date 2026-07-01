# 매장 재무(손익) 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매출만 보이던 앱에 지출을 채워 월 손익(순이익)을 완성한다 — 지출 장부 + 강사 정산 '지급 확정' → 인건비 지출 자동 반영 + 손익 요약.

**Architecture:** 신규 `expenses` 테이블(매출 `payments`와 완전 분리). 순수 계산은 `finance-calc.ts`(테스트 대상), server-only 게터 `finance.ts`, `"use server"` 액션 `finance-actions.ts`. 정산 '지급 확정' = 그 달 정산행 delete-then-insert(멱등). 손익은 매출−지출 조합. PC 콘솔 `/console/finance` 중심 + 모바일 `/t/perf` 순이익 스트립.

**Tech Stack:** Next.js 16.2.9, React 19, Bun, Supabase(supabase-js), Tailwind v4. 테스트 `bun test`, 타입체크 `bunx tsc --noEmit`, 린트 `bun run lint`, 빌드 `bun run build`.

**근거 스펙:** `docs/superpowers/specs/2026-07-02-store-finance-management-design.md` (특히 부록 B §11 — 파일별 무추측 명세). 3회 적대 검증 통과, 동작 잔여 0.

## Global Constraints

- **언어:** 회원/대표 대면 카피는 한국어. 코드·타입·주석은 기존 관례(주석 한국어 OK).
- **KST 오늘 = `todayISO()`** (`@/lib/data/db`). ⚠️ `kstDateISO(nowKstParts())` 금지(+9h 이중 시프트 버그).
- **금액:** `int`(원 단위), 표시 `won(n)` (`@/components/console/ui`), 콘솔 금액은 `<Money>` (`@/components/console/privacy`) 블러. `%`·라벨·날짜는 Money 미적용.
- **권한:** 모든 액션은 `getTrainerContext()` + `role==='owner'` 아니면 `OWNER_ONLY_ERROR` (`@/lib/auth/guard`). 콘솔 페이지는 레이아웃이 오너 게이팅(개별 `requireOwnerPage` 생략 = revenue 선례).
- **인덱스명:** `idx_<table>_<cols>` 접두 관례.
- **정산 인건비:** `role!=='owner'` && `payout>0`만 계상(대표 몫 제외 = net income excluding owner pay).
- **월 파생:** `off = Math.max(0, Math.floor(monthOffset)||0)`, `target = new Date(Date.UTC(kstY, kstM−off, 1))`. date 컬럼은 문자열 경계(`>=`/`<`)로 필터, 타임스탬프 경계 금지.
- **재사용 컴포넌트:** `Card, PBtn, OBtn, GBtn, ConsoleModal, won, pill` ← `@/components/console/ui`; `Money` ← `@/components/console/privacy`; `Icon` ← `@/components/ui/icon`; `useToast` ← `@/components/ui/Toast`. **신규 프리미티브/모달 만들지 말 것.**
- **커밋:** 태스크마다 1커밋. 브랜치 `membership-lifecycle`(현재). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: 마이그레이션 `0015_expenses.sql`

**Files:**
- Create: `supabase/migrations/0015_expenses.sql`

**Interfaces:**
- Produces: `expenses` 테이블(id, category, amount, spent_at, note, trainer_id, source, settle_month, recorded_by, created_at) — Task 3·5가 읽고 씀.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 매장 지출(손익) 장부: 나간 돈을 6개 분류로 기록해 월 순이익 완성. payments(매출)와 완전 분리.
-- category: labor 인건비·rent 임대료·utility 공과금·marketing 마케팅·supply 소모품·장비·etc 기타. RLS on(deny-by-default), service-role만.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('labor','rent','utility','marketing','supply','etc')),
  amount int not null check (amount > 0),
  spent_at date not null,                     -- 지출 발생일(KST, 앱이 todayISO 주입)
  note text,
  trainer_id uuid references trainers(id) on delete set null,  -- 인건비 귀속(옵션)
  source text not null default 'manual' check (source in ('manual','settlement','incentive')),
  settle_month text,                          -- 'YYYY-MM' 정산 출처 대상 월(정산행만)
  recorded_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
alter table expenses enable row level security;  -- service-role만(deny-by-default)

create index if not exists idx_expenses_settle on expenses (settle_month, source);
create index if not exists idx_expenses_spent_at on expenses (spent_at);
```

- [ ] **Step 2: SQL 문법 자체 검토(적용 전)**

Run: `grep -c "create table if not exists expenses" supabase/migrations/0015_expenses.sql`
Expected: `1`. 컬럼 10개·CHECK 3개·RLS 1줄·인덱스 2개가 있는지 눈으로 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0015_expenses.sql
git commit -m "feat(finance): 0015 expenses 테이블(지출 장부) 마이그레이션

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: (배포 시점) DB 적용 — 사용자 확인 후**

> ⚠️ 프로덕션 DB(2026-07-02 라이브)에 직접 적용. 실행 전 사용자에게 확인. Task 3~9의 런타임 검증은 이 적용 이후 가능(타입체크는 적용 없이도 통과).

Run: `set -a; . ./.env.deploy.local; set +a; bun run scripts/apply-migration.ts supabase/migrations/0015_expenses.sql`
Expected: 에러 없이 완료. 재실행해도 안전(`if not exists`).

---

## Task 2: 순수 계산 모듈 `finance-calc.ts` (TDD)

**Files:**
- Create: `src/lib/data/finance-calc.ts`
- Test: `src/lib/data/finance-calc.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORY_LABELS`, `type ExpenseCategory`, `type ExpenseSource`
  - `summarizeFinance({ revenue:number, expenses:{category:ExpenseCategory,amount:number}[], prevNet:number }) → { revenue, expenseTotal, netProfit, byCategory:{key,label,amount,pctOfRevenue:number|null}[], netDeltaPct:number|null }`
  - `settlementLaborRows(rows:{trainerId:string,role:string,payout:number}[], { monthKey:string, spentAt:string, recordedBy:string }) → LaborRow[]`
- Consumes: 없음(순수, DB/server-only 금지 → `bun:test` 가능).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/data/finance-calc.test.ts`:
```ts
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `bun test src/lib/data/finance-calc.test.ts`
Expected: FAIL — `Cannot find module './finance-calc'` 또는 export 없음.

- [ ] **Step 3: 최소 구현 작성**

`src/lib/data/finance-calc.ts`:
```ts
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
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `bun test src/lib/data/finance-calc.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/data/finance-calc.ts src/lib/data/finance-calc.test.ts
git commit -m "feat(finance): 순수 계산 모듈 finance-calc + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 게터 `finance.ts`

**Files:**
- Create: `src/lib/data/groups/finance.ts`

**Interfaces:**
- Consumes: `summarizeFinance`, `CATEGORY_LABELS`, `ExpenseCategory`, `ExpenseSource` (Task 2); `sb, nowKstParts` (`@/lib/data/db`), `monthLabelFromKst` (`@/lib/data/kst-bounds`); `expenses`·`payments` 테이블.
- Produces:
  - `getExpenses(monthOffset=0) → Promise<ExpensesView>` (Task 7)
  - `getFinanceSummary(monthOffset=0) → Promise<FinanceSummary>` (Task 7·9)
  - export 타입 `ExpenseItem, ExpensesView, FinanceSummary`

- [ ] **Step 1: 게터 파일 작성**

`src/lib/data/groups/finance.ts`:
```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `bunx tsc --noEmit`
Expected: 에러 없음(이 파일 관련). 기존 무관 에러가 있으면 그대로 두되 finance.ts 관련 신규 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/data/groups/finance.ts
git commit -m "feat(finance): getExpenses·getFinanceSummary 게터

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `getSettlement`에 `confirmed` 추가

**Files:**
- Modify: `src/lib/data/groups/settlement.ts`

**Interfaces:**
- Produces: `Settlement.confirmed: boolean` (Task 6이 소비). page.tsx 무수정(객체 통째 전달).

- [ ] **Step 1: `Settlement` 타입에 `confirmed` 추가**

`settlement.ts` line 16-21 `Settlement` 타입, `total: number;` 다음 줄에 추가:
```ts
  confirmed: boolean;
```

- [ ] **Step 2: 비오너 조기반환에 `confirmed:false`**

line 31 `return { monthOffset: off, monthLabel, rows: [], total: 0 };` →
```ts
  if (!t || t.role !== "owner") return { monthOffset: off, monthLabel, rows: [], total: 0, confirmed: false };
```

- [ ] **Step 3: monthKey 파생 + 확정행 조회 추가**

line 33 `const { startISO, endISO } = monthBoundsFromKst(target);` 다음에 추가:
```ts
  const monthKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
```
그리고 line 35-38의 `Promise.all([...])`에 3번째 쿼리를 추가하고 구조분해에 `settleRows`를 받는다:
```ts
  const [{ data: trainers }, { data: sessions }, { data: settleRows }] = await Promise.all([
    sb.from("trainers").select("id, display_name, role, status, rate_1on1, rate_2on1").order("role", { ascending: false }),
    sb.from("sessions").select("trainer_id, type, pay_rate").eq("status", "attended").gte("scheduled_at", startISO).lt("scheduled_at", endISO),
    sb.from("expenses").select("id").eq("source", "settlement").eq("settle_month", monthKey).limit(1),
  ]);
```

- [ ] **Step 4: 최종 return에 `confirmed`**

line 79 `return { monthOffset: off, monthLabel, rows, total };` →
```ts
  return { monthOffset: off, monthLabel, rows, total, confirmed: (settleRows?.length ?? 0) > 0 };
```

- [ ] **Step 5: 타입체크**

Run: `bunx tsc --noEmit`
Expected: settlement.ts 관련 신규 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/data/groups/settlement.ts
git commit -m "feat(finance): getSettlement에 confirmed(지급 확정 여부) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 액션 `finance-actions.ts`

**Files:**
- Create: `src/lib/data/groups/finance-actions.ts`

**Interfaces:**
- Consumes: `settlementLaborRows` (Task 2), `getSettlement` (Task 4), `sb, getTrainerContext, todayISO, nowKstParts` (`@/lib/data/db`), `OWNER_ONLY_ERROR` (`@/lib/auth/guard`).
- Produces (모두 `Promise<{ok:boolean;error?:string}>`):
  - `addExpense({category, amount, spentAt?, note?, trainerId?})` (Task 7)
  - `deleteExpense(id)` (Task 7)
  - `confirmSettlement(monthOffset=0)` (Task 6)
  - `unconfirmSettlement(monthOffset=0)` (Task 6)

- [ ] **Step 1: 액션 파일 작성**

`src/lib/data/groups/finance-actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, nowKstParts } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { getSettlement } from "@/lib/data/groups/settlement";
import { settlementLaborRows } from "@/lib/data/finance-calc";

type Result = { ok: boolean; error?: string };

const CATEGORIES = ["labor", "rent", "utility", "marketing", "supply", "etc"] as const;
type Category = (typeof CATEGORIES)[number];

/** monthOffset → 대상 월 키('YYYY-MM')와 그 달 KST 말일('YYYY-MM-DD'). getSettlement와 동일 off 규약. */
function monthKeys(monthOffset: number): { monthKey: string; lastDay: string } {
  const off = Math.max(0, Math.floor(monthOffset) || 0);
  const k = nowKstParts();
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth() - off;
  const monthKey = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { monthKey, lastDay };
}

export async function addExpense(input: {
  category: Category;
  amount: number;
  spentAt?: string;
  note?: string;
  trainerId?: string;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (!input.amount || input.amount <= 0) return { ok: false, error: "금액을 입력해주세요" };
  if (!CATEGORIES.includes(input.category)) return { ok: false, error: "분류를 선택해주세요" };

  const { error } = await sb.from("expenses").insert({
    category: input.category,
    amount: Math.round(input.amount),
    spent_at: input.spentAt || todayISO(),
    note: input.note?.trim() || null,
    trainer_id: input.category === "labor" ? (input.trainerId ?? null) : null,
    source: "manual",
    recorded_by: t.id,
  });
  if (error) return { ok: false, error: "지출 추가에 실패했어요" };
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { data: row } = await sb.from("expenses").select("source").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "지출을 찾을 수 없어요" };
  if (row.source === "settlement")
    return { ok: false, error: "정산 지급 항목은 정산 화면에서 취소해주세요" };

  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제에 실패했어요" };
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function confirmSettlement(monthOffset = 0): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { monthKey, lastDay } = monthKeys(monthOffset);
  const s = await getSettlement(monthOffset);

  // 멱등: 그 달 정산 인건비 행 전량 삭제 후 재삽입. // ponytail: delete→insert 비원자적(2요청), 실패 시 미확정 롤백 → 재클릭 자기치유.
  await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);

  const rows = settlementLaborRows(s.rows, { monthKey, spentAt: lastDay, recordedBy: t.id });
  if (rows.length > 0) {
    const { error } = await sb.from("expenses").insert(rows);
    if (error) return { ok: false, error: "정산 확정에 실패했어요" };
  }
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}

export async function unconfirmSettlement(monthOffset = 0): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const { monthKey } = monthKeys(monthOffset);
  const { error } = await sb.from("expenses").delete().eq("source", "settlement").eq("settle_month", monthKey);
  if (error) return { ok: false, error: "확정 취소에 실패했어요" };
  revalidatePath("/console/settlement");
  revalidatePath("/console/finance");
  revalidatePath("/t/perf");
  return { ok: true };
}
```

- [ ] **Step 2: 타입체크**

Run: `bunx tsc --noEmit`
Expected: finance-actions.ts 신규 에러 0. (`s.rows`가 `settlementLaborRows`의 `LaborInput[]`를 구조적으로 만족하는지 확인 — trainerId/role/payout 보유.)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/data/groups/finance-actions.ts
git commit -m "feat(finance): addExpense·deleteExpense·confirm/unconfirmSettlement 액션

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 정산 화면 지급 확정/취소 토글 (`settlement/ui.tsx`)

**Files:**
- Modify: `src/app/console/settlement/ui.tsx`

**Interfaces:**
- Consumes: `confirmSettlement, unconfirmSettlement` (Task 5), `settlement.confirmed`·`settlement.rows` (Task 4), `ConsoleModal, PBtn` (`@/components/console/ui`).

- [ ] **Step 1: import + 구조분해 확장**

line 9 아래에 추가:
```ts
import { confirmSettlement, unconfirmSettlement } from "@/lib/data/groups/finance-actions";
```
line 8 import에 `PBtn`이 없으면 추가: `import { Card, won, PBtn } from "@/components/console/ui";`
line 13 `const { monthOffset, monthLabel, rows, total } = settlement;` →
```ts
  const { monthOffset, monthLabel, rows, total, confirmed } = settlement;
```

- [ ] **Step 2: 합계 pill 옆에 `ConfirmControl` 배치**

line 24-27 합계 pill `<div className="ml-auto ...">…</div>`를 아래로 감싼다(pill의 `ml-auto` 제거, 래퍼가 `ml-auto`):
```tsx
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-baseline gap-2 rounded-[14px] bg-[#26231E] px-5 py-3">
            <span className="text-[12.5px] font-semibold text-[#CFC7B8]">이 달 지급 합계</span>
            <span className="text-[20px] font-bold text-surface">{won(total)}</span>
          </div>
          <ConfirmControl monthOffset={monthOffset} confirmed={confirmed} rows={rows} />
        </div>
```
(`ConsoleModal`은 아직 import 안 됐으면 line 8 import에 추가: `import { Card, won, PBtn, OBtn, ConsoleModal } from "@/components/console/ui";`)

- [ ] **Step 3: `ConfirmControl` 컴포넌트 추가**

`ui.tsx` 맨 아래(파일 끝)에 추가:
```tsx
function ConfirmControl({
  monthOffset,
  confirmed,
  rows,
}: {
  monthOffset: number;
  confirmed: boolean;
  rows: SettlementRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "confirm" | "unconfirm">(null);

  // 지급 대상 = 비오너 & payout>0. 0이면 확정할 인건비가 없어 컨트롤 숨김(대표 단독/무진행 달 no-op 방지).
  const payableCount = rows.filter((r) => r.payout > 0 && r.role !== "owner").length;

  async function run(kind: "confirm" | "unconfirm") {
    if (busy) return;
    setBusy(true);
    const res = kind === "confirm" ? await confirmSettlement(monthOffset) : await unconfirmSettlement(monthOffset);
    setBusy(false);
    if (!res.ok) {
      setModal(null);
      return toast(res.error ?? (kind === "confirm" ? "확정에 실패했어요" : "취소에 실패했어요"));
    }
    toast(kind === "confirm" ? "지급을 확정했어요" : "확정을 취소했어요");
    setModal(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {confirmed ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-[10px] bg-[#EDF4E3] px-2.5 py-1.5 text-[12.5px] font-bold text-[#5B6452]">
            <Icon name="check-bold" size={14} />지급 완료
          </span>
          <button
            onClick={() => setModal("unconfirm")}
            className="rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#9A917F] transition hover:bg-[#F4F0E8]"
          >
            확정 취소
          </button>
        </>
      ) : payableCount > 0 ? (
        <PBtn icon="check-bold" onClick={() => setModal("confirm")}>지급 확정</PBtn>
      ) : null}

      {modal === "confirm" ? (
        <ConsoleModal
          title="지급 확정"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={() => run("confirm")}>지급 확정</PBtn></>}
        >
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">이 달 정산을 지급 확정할까요? <b className="text-ink">인건비 지출</b>로 반영돼요.</p>
        </ConsoleModal>
      ) : null}

      {modal === "unconfirm" ? (
        <ConsoleModal
          title="확정 취소"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>닫기</OBtn><button onClick={() => run("unconfirm")} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">확정 취소</button></>}
        >
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">이 달 정산 확정을 취소할까요? 반영된 <b className="text-ink">인건비 지출</b>이 삭제돼요.</p>
        </ConsoleModal>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 하단 안내 문구 1줄 추가**

line 50 info 박스 마지막 문장(`…다음 진행분부터 적용).`) 바로 뒤(같은 `<span>` 안)에 추가:
```tsx
{" "}<b className="font-semibold text-[#5B5345]">지급 확정</b>하면 이 달 인건비가 <b className="font-semibold text-[#5B5345]">손익</b> 화면에 지출로 반영돼요.
```

- [ ] **Step 5: 타입체크**

Run: `bunx tsc --noEmit`
Expected: settlement/ui.tsx 신규 에러 0. (`SettlementRow` 이미 line 10에서 import됨.)

- [ ] **Step 6: 커밋**

```bash
git add src/app/console/settlement/ui.tsx
git commit -m "feat(finance): 정산 화면 지급 확정/취소 토글 + 확인 모달

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 손익 페이지 `/console/finance`

**Files:**
- Create: `src/app/console/finance/page.tsx`
- Create: `src/app/console/finance/ui.tsx`

**Interfaces:**
- Consumes: `getFinanceSummary, getExpenses` (Task 3), `addExpense, deleteExpense` (Task 5), `getStaff` (`@/lib/data/groups/owner-ops`), `Topbar` (`@/components/console/Topbar`), `Card, won, PBtn, OBtn, ConsoleModal, pill` (`@/components/console/ui`), `Money` (`@/components/console/privacy`), `Icon`, `useToast`.

- [ ] **Step 1: 서버 페이지 작성**

`src/app/console/finance/page.tsx`:
```tsx
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Topbar } from "@/components/console/Topbar";
import { Card, won } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { getFinanceSummary, getExpenses } from "@/lib/data/groups/finance";
import { getStaff } from "@/lib/data/groups/owner-ops";
import { ExpenseLedger } from "./ui";

const CAT_COLOR: Record<string, string> = {
  labor: "#768c6a", rent: "#b89a5e", utility: "#6e8aa0",
  marketing: "#c67352", supply: "#8fa187", etc: "#a89a80",
};

function NavArrow({ to, dir, disabled }: { to: number; dir: "prev" | "next"; disabled?: boolean }) {
  const cls = "flex h-9 w-9 items-center justify-center rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60] transition hover:bg-[#F4F0E8]";
  if (disabled) return <span className={`${cls} pointer-events-none opacity-40`}><Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} /></span>;
  return (
    <Link href={to <= 0 ? "/console/finance" : `/console/finance?m=${to}`} className={cls} aria-label={dir === "prev" ? "이전 달" : "다음 달"}>
      <Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} />
    </Link>
  );
}

export default async function ConsoleFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const off = Math.max(0, Number(sp.m ?? "0") || 0);
  const [summary, exp, staff] = await Promise.all([getFinanceSummary(off), getExpenses(off), getStaff()]);
  const staffPicks = staff.filter((s) => s.role !== "invited").map((s) => ({ id: s.id, name: s.name }));

  const net = summary.netProfit;
  const bars = summary.byCategory.filter((c) => c.amount > 0);

  return (
    <>
      <Topbar title="손익" sub={`${summary.monthLabel} · 손익 요약`} />
      <div className="flex-1 overflow-y-auto px-[34px] pb-10 pt-6">
        {/* 월 네비 */}
        <div className="mb-5 flex items-center gap-1.5">
          <NavArrow to={off + 1} dir="prev" />
          <span className="min-w-[104px] text-center text-[15px] font-bold text-ink">{summary.monthLabel}</span>
          <NavArrow to={off - 1} dir="next" disabled={off <= 0} />
        </div>

        {/* 손익 히어로 */}
        <div className="mb-4 flex items-end justify-between gap-5 rounded-[18px] px-6 py-[22px]"
          style={{ background: net >= 0 ? "#768C6A" : "#C67352", boxShadow: "0 14px 30px -22px rgba(75,59,46,0.5)" }}>
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-[#D7DCCF]">{summary.monthLabel.replace(/^\d+년 /, "")} 순이익</div>
            <Money className="serif whitespace-nowrap text-[38px] font-semibold leading-[0.9] text-surface">{won(net)}</Money>
            {summary.netDeltaPct != null ? (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="inline-flex items-center gap-[3px] rounded-[7px] bg-[#E7DCC5] px-[9px] py-1 text-[12px] font-bold text-[#26231E]"><Icon name="arrow-up-right" size={13} />{summary.netDeltaPct >= 0 ? "+" : ""}{summary.netDeltaPct}%</span>
                <span className="text-[12px] font-medium text-[#D7DCCF]">전월 대비</span>
              </div>
            ) : null}
            <div className="mt-4 flex gap-5">
              <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">매출</div><Money className="text-[14px] font-bold text-surface">{won(summary.revenue)}</Money></div>
              <div><div className="mb-[3px] text-[11px] font-medium text-[#CBD2BE]">지출</div><Money className="text-[14px] font-bold text-[#E7DCC5]">{won(summary.expenseTotal)}</Money></div>
            </div>
          </div>
        </div>

        {/* 지출 구성 */}
        <Card className="mb-4 px-[22px] py-5">
          <div className="mb-4 text-[15px] font-bold text-ink">지출 구성</div>
          {bars.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {bars.map((c) => {
                const over = (c.key === "rent" && (c.pctOfRevenue ?? 0) > 20) || (c.key === "labor" && (c.pctOfRevenue ?? 0) > 60);
                return (
                  <div key={c.key}>
                    <div className="mb-2 flex h-2 overflow-hidden rounded-[5px] bg-[#F4EFE6]">
                      <div style={{ width: `${Math.min(100, c.pctOfRevenue ?? 0)}%`, background: CAT_COLOR[c.key] }} />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: CAT_COLOR[c.key] }} />
                      <span className="flex-1 text-[13px] font-semibold text-ink">{c.label}</span>
                      {over ? <span style={pillStyle}>권장 초과</span> : null}
                      {c.pctOfRevenue != null ? <span className={`text-[12.5px] font-bold ${over ? "text-[#C67352]" : "text-[#766D60]"}`}>{c.pctOfRevenue}%</span> : null}
                      <Money className="min-w-[80px] text-right text-[12px] font-medium text-[#9A917F]">{won(c.amount)}</Money>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-[13px] font-medium text-[#A89F92]">이번 달 지출이 없어요</div>
          )}
        </Card>

        {/* 지출 장부 (client) */}
        <ExpenseLedger items={exp.items} staff={staffPicks} />

        <div className="h-3" />
      </div>
    </>
  );
}

const pillStyle: React.CSSProperties = { font: "700 11px Pretendard", color: "#C67352", background: "#FBF3E9", padding: "3px 9px", borderRadius: 7, whiteSpace: "nowrap", display: "inline-block" };
```

- [ ] **Step 2: 클라이언트 `ExpenseLedger` 작성**

`src/app/console/finance/ui.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, ConsoleModal, won, pill } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { addExpense, deleteExpense } from "@/lib/data/groups/finance-actions";
import type { ExpenseItem } from "@/lib/data/groups/finance";

const CATS = [
  { v: "labor", l: "인건비" }, { v: "rent", l: "임대료" }, { v: "utility", l: "공과금" },
  { v: "marketing", l: "마케팅" }, { v: "supply", l: "소모품·장비" }, { v: "etc", l: "기타" },
] as const;
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.v, c.l]));
const CAT_COLOR: Record<string, string> = {
  labor: "#768c6a", rent: "#b89a5e", utility: "#6e8aa0", marketing: "#c67352", supply: "#8fa187", etc: "#a89a80",
};
const FIELD = "w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]";
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function ExpenseLedger({ items, staff }: { items: ExpenseItem[]; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<ExpenseItem | null>(null);
  // 폼
  const [category, setCategory] = useState<string>("etc");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(kstToday());
  const [note, setNote] = useState("");
  const [trainerId, setTrainerId] = useState("");

  function reset() { setCategory("etc"); setAmount(""); setSpentAt(kstToday()); setNote(""); setTrainerId(""); }

  async function submit() {
    if (busy) return;
    const amt = amount.replace(/[^\d]/g, "");
    if (!amt) return toast("금액을 입력해주세요");
    setBusy(true);
    const r = await addExpense({
      category: category as (typeof CATS)[number]["v"],
      amount: Number(amt),
      spentAt,
      note: note.trim() || undefined,
      trainerId: category === "labor" && trainerId ? trainerId : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "지출 추가에 실패했어요");
    toast("지출을 추가했어요");
    setOpen(false); reset(); router.refresh();
  }

  async function confirmDelete() {
    if (!del || busy) return;
    setBusy(true);
    const r = await deleteExpense(del.id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요");
    toast("지출을 삭제했어요");
    setDel(null); router.refresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[rgba(75,59,46,0.07)] px-[22px] py-4">
        <span className="text-[15px] font-bold text-ink">지출 내역</span>
        <span className="text-[12px] font-medium text-[#9A917F]">{items.length}건</span>
        <span className="ml-auto"><PBtn icon="plus-bold" className="!py-[10px]" onClick={() => { reset(); setOpen(true); }}>지출 추가</PBtn></span>
      </div>
      <div className="flex items-center border-b border-[rgba(75,59,46,0.06)] px-[22px] py-[11px] text-[11px] font-semibold tracking-[0.02em] text-[#A89F92]">
        <span className="w-[64px]">날짜</span><span className="flex-1">분류 · 메모</span><span className="w-[90px]">강사</span><span className="w-[120px] text-right">금액</span>
      </div>
      {items.length > 0 ? (
        items.map((it) => (
          <div key={it.id} className="flex items-center border-b border-[rgba(75,59,46,0.05)] px-[22px] py-3.5 last:border-b-0 hover:bg-[#FBFAF7]">
            <span className="w-[64px] text-[13px] font-semibold text-[#847A66]">{it.dateLabel}</span>
            <div className="flex flex-1 items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]" style={{ background: "#F4EFE6" }}>
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: CAT_COLOR[it.category] }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-ink">{CAT_LABEL[it.category]}</span>
                  {it.source === "settlement" ? <span style={pill("#5B6452", "#EDF4E3")}>정산 지급</span> : null}
                </div>
                {it.note ? <div className="text-[12px] font-medium text-[#9A917F]">{it.note}</div> : null}
              </div>
            </div>
            <span className="w-[90px] text-[12.5px] font-medium text-[#847A66]">{it.trainerName ?? "—"}</span>
            <Money className="w-[120px] text-right text-[14px] font-bold">{<span style={{ color: "#4B3B2E" }}>{won(it.amount)}</span>}</Money>
            {it.source !== "settlement" ? (
              <button onClick={() => setDel(it)} aria-label="삭제" className="ml-2 flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#F4EFE6] text-[#A89F92] transition hover:text-[#C67352]"><Icon name="trash" size={15} /></button>
            ) : <span className="ml-2 w-8" />}
          </div>
        ))
      ) : (
        <div className="px-5 py-12 text-center text-[13.5px] font-semibold text-[#847A66]">이번 달 지출이 없어요</div>
      )}

      {open ? (
        <ConsoleModal
          title="지출 추가"
          onClose={() => setOpen(false)}
          footer={<><OBtn className="flex-1" onClick={() => setOpen(false)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={submit}>추가</PBtn></>}
        >
          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">분류</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mb-3.5 ${FIELD}`}>
            {CATS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">금액</div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="₩ 금액" className={`mb-3.5 ${FIELD}`} />

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">날짜</div>
          <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={`mb-3.5 ${FIELD}`} />

          {category === "labor" ? (
            <>
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">강사 (선택)</div>
              <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={`mb-3.5 ${FIELD}`}>
                <option value="">선택 안 함</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          ) : null}

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">메모 (선택)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 6월 임대료" className={FIELD} />
        </ConsoleModal>
      ) : null}

      {del ? (
        <ConsoleModal
          title="지출 삭제"
          onClose={() => setDel(null)}
          footer={<><OBtn className="flex-1" onClick={() => setDel(null)}>취소</OBtn><button onClick={confirmDelete} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">삭제</button></>}
        >
          <div className="text-[14px] font-medium leading-relaxed text-[#5B5345]">이 지출 기록을 삭제할까요? 되돌릴 수 없어요.</div>
        </ConsoleModal>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `bunx tsc --noEmit && bun run lint`
Expected: finance 페이지 신규 에러 0. (`getStaff`가 `StaffMember[]`(role 포함) 반환 확인.)

- [ ] **Step 4: 커밋**

```bash
git add src/app/console/finance/page.tsx src/app/console/finance/ui.tsx
git commit -m "feat(finance): /console/finance 손익 페이지(히어로·지출구성·지출장부)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 사이드바 손익 nav + `chart` 아이콘

**Files:**
- Modify: `docs/design-handoff/pt-icons.js` (아이콘 소스)
- Modify: `src/components/console/Sidebar.tsx`
- (자동 생성) `src/components/ui/icon-data.ts` — 직접 편집 금지, `gen-icons.ts`가 재생성

**Interfaces:**
- Consumes: 없음. Produces: `chart` IconName, `/console/finance` nav 항목.

- [ ] **Step 1: `pt-icons.js`에 `chart` 글리프 추가**

`docs/design-handoff/pt-icons.js`의 아이콘 객체에 항목 추가(기존 항목과 동일 형식 — filled 막대 3개):
```js
  chart: { viewBox: "0 0 24 24", body: '<rect x="3" y="13" width="4" height="8" rx="1.5" fill="currentColor"/><rect x="10" y="7" width="4" height="14" rx="1.5" fill="currentColor"/><rect x="17" y="3" width="4" height="18" rx="1.5" fill="currentColor"/>' },
```
> 형식은 파일 내 기존 항목을 열어 정확히 맞출 것(키:`chart`, `viewBox`+`body` 또는 파일이 쓰는 필드명). 채워진(fill) 도형이어야 함(Icon은 stroke 없이 fill=currentColor 렌더).

- [ ] **Step 2: 아이콘 재생성**

Run: `bun run scripts/gen-icons.ts`
Expected: 성공. `src/components/ui/icon-data.ts`에 `chart`가 포함되고 `IconName` 유니온에 추가됨.

- [ ] **Step 3: 재생성 확인**

Run: `grep -c '"chart"\|chart:' src/components/ui/icon-data.ts`
Expected: `>=1`.

- [ ] **Step 4: Sidebar NAV 항목 추가**

`Sidebar.tsx` NAV 배열에서 `settlement` 항목 다음(`settings` 앞)에 삽입:
```ts
  { key: "finance", label: "손익", href: "/console/finance", icon: "chart", activeIcon: "chart" },
```

- [ ] **Step 5: 타입체크**

Run: `bunx tsc --noEmit`
Expected: Sidebar 신규 에러 0(`icon:"chart"`가 IconName에 존재).

- [ ] **Step 6: 커밋**

```bash
git add docs/design-handoff/pt-icons.js src/components/ui/icon-data.ts src/components/console/Sidebar.tsx
git commit -m "feat(finance): 콘솔 사이드바 손익 nav + chart 아이콘

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 모바일 `/t/perf` 순이익 스트립

**Files:**
- Modify: `src/app/(app)/t/perf/page.tsx`

**Interfaces:**
- Consumes: `getFinanceSummary` (Task 3), 기존 로컬 `won()`.

- [ ] **Step 1: import 추가**

line 7 `import { getStudioOps, getOutstanding } from "@/lib/data/groups/owner-ops";` 다음 줄에:
```ts
import { getFinanceSummary } from "@/lib/data/groups/finance";
```

- [ ] **Step 2: Promise.all에 getFinanceSummary 합류**

line 72-76 `const [ops, chatUnread, outstanding] = await Promise.all([...]);` →
```ts
  const [ops, chatUnread, outstanding, finance] = await Promise.all([
    getStudioOps(),
    chatUnreadFor(t.id),
    getOutstanding(),
    getFinanceSummary(0),
  ]);
```

- [ ] **Step 3: 순이익 스트립 삽입**

header 블록 닫는 `</div>`(운영 현황 제목 블록 끝, line ~103) 다음, `{/* 운영 지표 ... */}` 주석·grid 바로 위에 삽입:
```tsx
        {/* 이번 달 순이익 — 전폭 강조 스트립. 음수면 terracotta */}
        <div className={`mb-2.5 rounded-[16px] border p-4 ${finance.netProfit < 0 ? "border-terracotta/20 bg-warm-banner" : "border-ink/[0.07] bg-sage-banner"}`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-muted">이번 달 순이익</span>
            {finance.netDeltaPct != null ? (
              <span className={`text-[11.5px] font-semibold ${finance.netDeltaPct < 0 ? "text-terracotta" : "text-muted2"}`}>
                전월 대비 {finance.netDeltaPct >= 0 ? "+" : ""}{finance.netDeltaPct}%
              </span>
            ) : null}
          </div>
          <div className={`serif mt-1.5 text-[26px] font-bold leading-none ${finance.netProfit < 0 ? "text-terracotta" : "text-ink"}`}>{won(finance.netProfit)}</div>
          <div className="mt-2 text-[11.5px] font-medium text-muted2">매출 {won(finance.revenue)} · 지출 {won(finance.expenseTotal)}</div>
        </div>
```

- [ ] **Step 4: 타입체크**

Run: `bunx tsc --noEmit`
Expected: perf 페이지 신규 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/t/perf/page.tsx"
git commit -m "feat(finance): 모바일 운영 현황에 이번 달 순이익 스트립

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `deleteInstructor` 방어적 null-out + 최종 빌드

**Files:**
- Modify: `src/lib/auth/trainer-actions.ts:193-195`

**Interfaces:**
- Consumes: 없음. (방어적 — 현재는 대표만 지출 기록·대표 미삭제라 도달 불가하나 payments 패턴과 일관.)

- [ ] **Step 1: expenses.recorded_by null-out 1줄 추가**

`trainer-actions.ts` line 193-195 (payments/attendance_ledger/workout_records null-out 블록)에 한 줄 추가:
```ts
  await admin.from("expenses").update({ recorded_by: null }).eq("recorded_by", id);
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `bunx tsc --noEmit && bun run lint`
Expected: 신규 에러 0.

- [ ] **Step 3: 전체 빌드(통합 검증)**

Run: `bun run build`
Expected: 빌드 성공. `/console/finance` 라우트가 빌드 산출물에 포함.

- [ ] **Step 4: 유닛 테스트 재확인**

Run: `bun test`
Expected: 전체 통과(기존 + finance-calc 5개).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/trainer-actions.ts
git commit -m "chore(finance): deleteInstructor에 expenses.recorded_by null-out(방어)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 런타임 검증 (마이그레이션 적용 후, 수동)

> DB 거동은 `bun test`로 검증 불가(스펙 §7). 마이그레이션(Task 1 Step 4) 적용 후 `bun run dev`로 아래 시나리오 수동 확인:

1. `/console/finance`: 지출 추가(임대료 등) → 목록·지출 구성·순이익 반영. 인건비 선택 시 강사 드롭다운 노출.
2. `/console/settlement`: 진행 수업 있는 달에서 "지급 확정" → "지급 완료" 배지 전환 → `/console/finance`에 인건비 행(정산 지급 배지, 삭제버튼 없음) 등장. "확정 취소" → 사라짐. **재클릭 확정해도 1강사 1행**.
3. 대표 단독(비오너 payout 0) 달: "지급 확정" 버튼 미노출(no-op 없음).
4. 모바일 `/t/perf`: 상단 순이익 스트립, 지출>매출이면 terracotta.
5. `deleteExpense`: 정산 지급 행은 삭제 시도 시 "정산 화면에서 취소해주세요".

---

## Self-Review (작성자 체크)

**Spec coverage:** §4 데이터모델→T1 · §11.2 순수모듈→T2 · §5 게터→T3 · §11.5 confirmed→T4 · §5 액션→T5 · §6.3 정산토글→T6 · §6.2 손익페이지→T7 · §6.1 nav+아이콘→T8 · §6.4 모바일→T9 · §11.9 deleteInstructor→T10. 전 섹션 커버.

**Placeholder scan:** TODO/TBD/"적절히 처리" 없음. 모든 코드 스텝에 완전한 코드.

**Type consistency:** `summarizeFinance`/`settlementLaborRows` 시그니처(T2) = 소비처(T3·T5) 일치. `FinanceSummary`/`ExpenseItem`(T3) = 페이지 소비(T7·T9) 일치. `confirmed`(T4) = ui 소비(T6) 일치. `addExpense/deleteExpense/confirmSettlement/unconfirmSettlement`(T5) = ui 호출(T6·T7) 일치.
