# 회원권 라이프사이클 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원권 발급·결제·차감·연장·환불·양도·알림을 대표 인터뷰 확정 규칙대로 구현한다.

**Architecture:** 재사용 우선 — 신규 테이블은 `membership_events`·`notifications` 2개뿐. 분할/혼합결제·환불은 기존 `payments`(여러 행 / 음수 행), 차감은 기존 `attendance_ledger`로 흡수. 순수 로직(상품·미수금·환불·차감 판정·만료일)은 `bun:test`로 TDD하고, Supabase IO를 만지는 server action은 typecheck·build·수동 스모크로 검증한다.

**Tech Stack:** Next.js 16.2.9 (App Router, server actions), React 19, Supabase(Postgres, service-role 서버 접근), Bun(test/build/scripts), Tailwind v4.

스펙: `docs/superpowers/specs/2026-06-27-membership-lifecycle-design.md`. 브랜치: `membership-lifecycle`.

## Global Constraints

모든 태스크에 암묵 적용된다. 값은 스펙·코드베이스에서 그대로 가져옴.

- **테스트**: `package.json`에 test 스크립트 없음. 단위 테스트는 `bun test <파일>`로 직접 실행. `import { test, expect } from "bun:test"`, `*.test.ts` colocate. jest/vitest 금지.
- **타입체크/빌드**: `bunx tsc --noEmit`(빠른 검증), `bun run build`(전체). 스크립트는 `bun run scripts/X.ts`.
- **Next.js 16은 학습 데이터와 다름**: 새 패턴 쓰기 전 `node_modules/next/dist/docs/` 해당 가이드 확인 (AGENTS.md).
- **데이터 접근**: 서버에서 `sb`(service-role, `@/lib/data/db`)로. 클라이언트에서 Supabase 직접 호출 금지. server action은 파일 상단 `"use server"`.
- **대표 전용**: 발급·결제·연장·환불·양도 action은 `getTrainerContext()` 후 `if (t.role !== "owner") return { ok:false, error: OWNER_ONLY_ERROR }` (패턴: `owner-ops-actions.ts:40`, `OWNER_ONLY_ERROR`는 `@/lib/auth/guard`).
- **UI 카피 한국어**. 회원 대상 트레이너 호칭은 **선생님**(코치/트레이너 금지). 다크모드 스타일(`dark:`) 금지(라이트 전용).
- **마이그레이션**: 추가·idempotent만(`add value if not exists`, `add column if not exists`, `create table if not exists`). psql 미설치 → Bun.SQL 적용(Task 4).
- **돈/감사 경로는 단순화 금지**: 차감은 `attendance_ledger`, 라이프사이클은 `membership_events`, 결제·환불은 `payments` 행으로 흔적을 남긴다.
- **커밋 자주**. 각 태스크 끝에 커밋. 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

# Phase 1 — 기반 (상품·타입·마이그레이션·미수금·통합 등록)

### Task 1: 상품 설정 + 순수 헬퍼 `products.ts`

**Files:**
- Create: `src/lib/data/products.ts`
- Test: `src/lib/data/products.test.ts`

**Interfaces:**
- Produces:
  - `type ProductKey = "8" | "16" | "24"`
  - `type Tier = "owner" | "instructor"`
  - `PRODUCTS: Record<ProductKey, { sessions:number; days:number; price:Record<Tier,number>; unitList:Record<Tier,number> }>`
  - `tierForRole(role: "owner"|"instructor"): Tier`
  - `expiryDate(startISO: string, product: ProductKey): string`  // "YYYY-MM-DD"
  - `priceFor(product: ProductKey, tier: Tier): number`
  - `unitListFor(product: ProductKey, tier: Tier): number`
  - `PRODUCT_KEYS: ProductKey[]`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/data/products.test.ts`

```ts
import { test, expect } from "bun:test";
import { expiryDate, tierForRole, PRODUCTS, PRODUCT_KEYS } from "./products";

test("expiryDate: 8회=+30일, 16회=+60일, 24회=+90일", () => {
  expect(expiryDate("2026-06-27", "8")).toBe("2026-07-27");   // +30
  expect(expiryDate("2026-06-27", "16")).toBe("2026-08-26");  // +60
  expect(expiryDate("2026-06-27", "24")).toBe("2026-09-25");  // +90
});

test("tierForRole: owner→owner, instructor→instructor", () => {
  expect(tierForRole("owner")).toBe("owner");
  expect(tierForRole("instructor")).toBe("instructor");
});

test("카탈로그는 8/16/24 세 상품, sessions/days 일치", () => {
  expect(PRODUCT_KEYS).toEqual(["8", "16", "24"]);
  expect(PRODUCTS["8"].sessions).toBe(8);
  expect(PRODUCTS["16"].days).toBe(60);
  expect(PRODUCTS["24"].sessions).toBe(24);
});
```

- [ ] **Step 2: 테스트 실패 확인** — `bun test src/lib/data/products.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/lib/data/products.ts`

```ts
// 회원권 상품 단일 출처. 가격은 대표/강사(tier) 이중 단가 + 1회 정상가(unitList, 환불 차감용).
// 숫자 0 = TBD(대표 확인 후 입력). 스펙 §2/§9.
export type ProductKey = "8" | "16" | "24";
export type Tier = "owner" | "instructor";

export const PRODUCTS: Record<ProductKey, {
  sessions: number; days: number;
  price: Record<Tier, number>;
  unitList: Record<Tier, number>;
}> = {
  "8":  { sessions: 8,  days: 30, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
  "16": { sessions: 16, days: 60, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
  "24": { sessions: 24, days: 90, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
};

export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];

export function tierForRole(role: "owner" | "instructor"): Tier {
  return role === "owner" ? "owner" : "instructor";
}

/** start + 상품 일수 = 만료일(UTC 날짜 산술, "YYYY-MM-DD"). */
export function expiryDate(startISO: string, product: ProductKey): string {
  const ms = new Date(startISO + "T00:00:00Z").getTime() + PRODUCTS[product].days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export const priceFor = (p: ProductKey, t: Tier) => PRODUCTS[p].price[t];
export const unitListFor = (p: ProductKey, t: Tier) => PRODUCTS[p].unitList[t];
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/products.test.ts` → PASS (4 tests)
- [ ] **Step 5: 커밋** — `git add src/lib/data/products.ts src/lib/data/products.test.ts && git commit -m "feat(products): 8/16/24 회원권 카탈로그 + 순수 헬퍼"`

---

### Task 2: 타입 갱신 (`types.ts`)

**Files:**
- Modify: `src/lib/types.ts:67`, `:73`, `:472-477` (+ import)

**Interfaces:**
- Consumes: `ProductKey` (Task 1)
- Produces: `Membership.product: ProductKey`, `Membership.status: "active"|"expired"|"refunded"`, `Membership.listUnitPrice: number|null`, `MembershipProduct.product: ProductKey` + `tier`/`unitList`

- [ ] **Step 1: import 추가** — `types.ts` 상단 import 블록에:

```ts
import type { ProductKey } from "@/lib/data/products";
```

- [ ] **Step 2: `Membership` 인터페이스 수정** (`:64-75`)

```ts
export interface Membership {
  id: string;
  memberId: string;
  product: ProductKey;
  totalSessions: number;
  remainingSessions: number;
  startDate: string;
  endDate: string;
  price: number | null;
  listUnitPrice: number | null;
  status: "active" | "expired" | "refunded";
  guided: boolean;
}
```

- [ ] **Step 3: `MembershipProduct` 인터페이스 수정** (`:472-477`)

```ts
export interface MembershipProduct {
  product: ProductKey;
  label: string;        // "8회권"
  price: number;        // 선택 tier 판매가
  unitList: number;     // 선택 tier 1회 정상가
  recommended: boolean;
}
```

- [ ] **Step 4: 타입체크** — `bunx tsc --noEmit` → 기존 `"10"|"20"|"30"` 참조가 깨지는 곳이 에러로 드러남(Task 3·7에서 수정). 이 단계는 에러 목록 확인용. `membership/ui.tsx:27`의 `useState<"10"|"20"|"30">`, `getMembershipProducts`가 후속 태스크 대상.
- [ ] **Step 5: 커밋** — `git add src/lib/types.ts && git commit -m "types: Membership product=ProductKey, status+refunded, listUnitPrice"`

---

### Task 3: 카탈로그 getter + seed를 8/16/24로 교체

**Files:**
- Modify: `src/lib/data/groups/owner-ops.ts:225-231` (`getMembershipProducts`)
- Modify: `src/lib/data/seed.ts:201-203`

**Interfaces:**
- Consumes: `PRODUCTS`, `PRODUCT_KEYS`, `priceFor`, `unitListFor`, `Tier` (Task 1)
- Produces: `getMembershipProducts(tier: Tier): MembershipProduct[]`

- [ ] **Step 1: `getMembershipProducts` 교체** (`owner-ops.ts:225`) — tier 인자로 가격 결정. 파일 상단에 `import { PRODUCT_KEYS, PRODUCTS, priceFor, unitListFor, type Tier } from "@/lib/data/products";`

```ts
/** 회원권 카탈로그(8/16/24). 가격은 tier(대표/강사)별. */
export function getMembershipProducts(tier: Tier = "owner"): MembershipProduct[] {
  return PRODUCT_KEYS.map((product) => ({
    product,
    label: `${PRODUCTS[product].sessions}회권`,
    price: priceFor(product, tier),
    unitList: unitListFor(product, tier),
    recommended: product === "16",
  }));
}
```

- [ ] **Step 2: seed 카탈로그 교체** (`seed.ts:201-203`)

```ts
  { product: "8" as const,  label: "8회권",  price: 0, recommended: false },
  { product: "16" as const, label: "16회권", price: 0, recommended: true },
  { product: "24" as const, label: "24회권", price: 0, recommended: false },
```

- [ ] **Step 3: 타입체크** — `bunx tsc --noEmit` → `getMembershipProducts` 호출부(membership/page.tsx)와 seed가 통과하는지 확인(호출부는 Task 7에서 tier 전달).
- [ ] **Step 4: 커밋** — `git add src/lib/data/groups/owner-ops.ts src/lib/data/seed.ts && git commit -m "feat(catalog): getMembershipProducts 8/16/24 + tier 단가"`

---

### Task 4: 마이그레이션 `0003` + 적용 스크립트

**Files:**
- Create: `supabase/migrations/0003_membership_lifecycle.sql`
- Create: `scripts/apply-migration.ts`

- [ ] **Step 1: 마이그레이션 SQL 작성** — `supabase/migrations/0003_membership_lifecycle.sql`

```sql
-- 회원권 라이프사이클: 환불 상태, 정상가 스냅샷, 이력/알림 테이블. 추가·idempotent.
alter type membership_status add value if not exists 'refunded';

alter table memberships add column if not exists list_unit_price int;

create table if not exists membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  type text not null check (type in ('issue','extend','refund','transfer')),
  amount int,
  note text,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_membership_events_ms on membership_events(membership_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type actor_type not null,
  recipient_id uuid not null,
  type text not null check (type in ('low_sessions','expiring')),
  title text not null,
  body text,
  membership_id uuid references memberships(id) on delete cascade,
  channel text not null default 'in_app',
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_recipient on notifications(recipient_type, recipient_id, status);

alter table membership_events enable row level security;
alter table notifications enable row level security;
```

- [ ] **Step 2: 적용 스크립트 작성** — `scripts/apply-migration.ts`

```ts
// 마이그레이션을 Supabase Postgres에 직접 적용(psql 미설치 → Bun.SQL).
// 실행:  set -a; . ./.env.deploy.local; set +a; bun run scripts/apply-migration.ts supabase/migrations/0003_membership_lifecycle.sql
import { SQL } from "bun";
const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: bun run scripts/apply-migration.ts <file.sql> [...]");
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("missing SUPABASE_DB_URL — `set -a; . ./.env.deploy.local; set +a` 먼저");
const sql = new SQL(url);
for (const f of files) {
  console.log(`→ applying ${f}`);
  await sql.unsafe(await Bun.file(f).text());
}
await sql.end();
console.log("done");
```

- [ ] **Step 3: 적용** — 터미널에서:

```bash
set -a; . ./.env.deploy.local; set +a
bun run scripts/apply-migration.ts supabase/migrations/0003_membership_lifecycle.sql
```
Expected: `→ applying ...` / `done`. (만약 `ALTER TYPE ... ADD VALUE cannot run inside a transaction block` 에러면, 그 한 줄만 별도 .sql로 분리해 먼저 적용.)

- [ ] **Step 4: 적용 검증** — 다음 한 줄 스모크:

```bash
set -a; . ./.env.deploy.local; set +a
bun -e 'import{SQL}from"bun";const s=new SQL(process.env.SUPABASE_DB_URL);console.log(await s.unsafe("select to_regclass('"'"'public.notifications'"'"') nt, to_regclass('"'"'public.membership_events'"'"') me"));await s.end()'
```
Expected: `nt`, `me` 둘 다 non-null.

- [ ] **Step 5: 커밋** — `git add supabase/migrations/0003_membership_lifecycle.sql scripts/apply-migration.ts && git commit -m "feat(db): 0003 membership lifecycle migration + apply script"`

---

### Task 5: 미수금 순수 계산 + getter

**Files:**
- Create: `src/lib/data/balance.ts`
- Test: `src/lib/data/balance.test.ts`
- Modify: `src/lib/data/groups/owner-ops.ts` (getter 추가)

**Interfaces:**
- Produces:
  - `outstanding(price: number|null, paymentAmounts: number[]): number`  // 미수금(음수 환불행 제외, 0 이상 clamp)
  - `paidInFull(price: number|null, paymentAmounts: number[]): boolean`
  - `getMembershipBalance(membershipId: string): Promise<{ price:number|null; paid:number; outstanding:number; paidInFull:boolean }>`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/balance.test.ts`

```ts
import { test, expect } from "bun:test";
import { outstanding, paidInFull } from "./balance";

test("미수금 = 가격 − 양수 결제 합계", () => {
  expect(outstanding(1300000, [1000000])).toBe(300000);
});
test("음수(환불) 결제는 미수금 계산에서 제외", () => {
  expect(outstanding(1300000, [1300000, -500000])).toBe(0);
});
test("완납·과납이면 미수금 0(clamp)", () => {
  expect(outstanding(1000000, [1000000])).toBe(0);
  expect(outstanding(1000000, [1200000])).toBe(0);
});
test("price null이면 미수금 0", () => {
  expect(outstanding(null, [])).toBe(0);
});
test("paidInFull", () => {
  expect(paidInFull(1000000, [600000])).toBe(false);
  expect(paidInFull(1000000, [600000, 400000])).toBe(true);
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/balance.test.ts` → FAIL
- [ ] **Step 3: 구현** — `src/lib/data/balance.ts`

```ts
const sumPositive = (xs: number[]) => xs.filter((a) => a > 0).reduce((s, a) => s + a, 0);

/** 미수금 = max(0, price − Σ양수결제). price null이면 0. */
export function outstanding(price: number | null, paymentAmounts: number[]): number {
  if (price == null) return 0;
  return Math.max(0, price - sumPositive(paymentAmounts));
}

export function paidInFull(price: number | null, paymentAmounts: number[]): boolean {
  if (price == null) return true;
  return sumPositive(paymentAmounts) >= price;
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/balance.test.ts` → PASS
- [ ] **Step 5: getter 추가** — `owner-ops.ts` 끝에. 상단에 `import { outstanding, paidInFull } from "@/lib/data/balance";`

```ts
/** 회원권 미수금 요약. */
export async function getMembershipBalance(membershipId: string) {
  const { data: ms } = await sb.from("memberships").select("price").eq("id", membershipId).maybeSingle();
  const { data: pays } = await sb.from("payments").select("amount").eq("membership_id", membershipId);
  const amounts = (pays ?? []).map((p) => (p.amount as number | null) ?? 0);
  const price = (ms?.price as number | null) ?? null;
  return { price, paid: amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0), outstanding: outstanding(price, amounts), paidInFull: paidInFull(price, amounts) };
}
```

- [ ] **Step 6: 커밋** — `git add src/lib/data/balance.ts src/lib/data/balance.test.ts src/lib/data/groups/owner-ops.ts && git commit -m "feat(balance): 미수금 순수 계산 + getMembershipBalance"`

---

### Task 6: 발급·결제 action 재구성 (tier 단가 · 회차별 만료 · 분할결제 · 통합 등록)

**Files:**
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`issueMembership`, `recordPayment`, `createMember`)

**Interfaces:**
- Consumes: `PRODUCTS`, `expiryDate`, `priceFor`, `unitListFor`, `tierForRole`, `ProductKey`, `Tier` (Task 1)
- Produces:
  - `issueMembership(memberId: string, product: ProductKey): Promise<Result & { membershipId?: string }>`  // tier 자동, 회차별 만료, list_unit_price 저장
  - `recordPayment(input: { memberId?; membershipId?; method: PaymentMethod; amount?: number }): Promise<Result>`  // amount 직접 지정(분할/혼합) 지원
  - `registerMember(input: { name; phone; birth; gender; weekdays:number[]; hour:number; product: ProductKey; payments: { method:PaymentMethod; amount:number }[] }): Promise<Result & { memberId?: string }>`  // 정보+회원권+첫결제 통합

- [ ] **Step 1: helper — 회원의 tier 판정** — `owner-ops-actions.ts` 상단 import + 함수 추가. import: `import { PRODUCTS, expiryDate, priceFor, unitListFor, tierForRole, type ProductKey, type Tier } from "@/lib/data/products";`

```ts
/** 회원의 담당 강사 role로 tier 결정(없으면 owner 가격). */
async function tierForMember(memberId: string): Promise<Tier> {
  const { data } = await sb
    .from("member_trainers")
    .select("trainers(role)")
    .eq("member_id", memberId)
    .limit(1)
    .maybeSingle();
  const role = (data?.trainers as unknown as { role: string } | null)?.role;
  return tierForRole(role === "owner" ? "owner" : "instructor");
}
```

- [ ] **Step 2: `issueMembership` 교체** (`:88-122`) — `PRODUCT_PRICE` 상수(`:23-27`) 삭제, 시그니처 `product: ProductKey`.

```ts
export async function issueMembership(
  memberId: string,
  product: ProductKey,
): Promise<Result & { membershipId?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const tier = await tierForMember(memberId);
  const total = PRODUCTS[product].sessions;
  const start = todayISO();

  const { data: ms, error } = await sb
    .from("memberships")
    .insert({
      member_id: memberId,
      product,
      total_sessions: total,
      remaining_sessions: total,
      start_date: start,
      end_date: expiryDate(start, product),
      price: priceFor(product, tier) || null,
      list_unit_price: unitListFor(product, tier) || null,
      status: "active",
      guided: false,
    })
    .select("id")
    .single();
  if (error || !ms) return { ok: false, error: "회원권 발급에 실패했어요" };

  await sb.from("membership_events").insert({ membership_id: ms.id, type: "issue", created_by: t.id });
  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/t");
  return { ok: true, membershipId: ms.id };
}
```

- [ ] **Step 3: `recordPayment`에 `amount` 지원** (`:125-170`) — 분할/혼합: 호출자가 금액 지정 가능. 미지정 시 기존처럼 회원권 price 사용.

기존 `recordPayment`의 시그니처와 insert를 다음으로 교체 (membership 조회 로직은 유지, `amount` 결정만 변경):

```ts
export async function recordPayment(input: {
  memberId?: string;
  membershipId?: string;
  method: PaymentMethod;
  amount?: number;
}): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  let membershipId = input.membershipId;
  let fallbackAmount: number | null = null;
  if (!membershipId && input.memberId) {
    const { data: ms } = await sb
      .from("memberships").select("id, price")
      .eq("member_id", input.memberId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    membershipId = ms?.id;
    fallbackAmount = (ms?.price as number | null) ?? null;
  } else if (membershipId) {
    const { data: ms } = await sb.from("memberships").select("price").eq("id", membershipId).maybeSingle();
    fallbackAmount = (ms?.price as number | null) ?? null;
  }
  if (!membershipId) return { ok: false, error: "결제할 회원권을 찾지 못했어요" };

  const amount = input.amount != null ? Math.round(input.amount) : fallbackAmount;
  const { error } = await sb.from("payments").insert({
    membership_id: membershipId, method: input.method, amount, paid_at: todayISO(), recorded_by: t.id,
  });
  if (error) return { ok: false, error: "결제 기록에 실패했어요" };
  revalidatePath("/t");
  return { ok: true };
}
```

- [ ] **Step 4: `registerMember` 통합 action 추가** — `createMember`의 회원/스케줄 생성 로직을 재사용하되 회원권+첫결제까지. `createMember`는 내부 보존(또는 registerMember가 흡수). 새 함수 추가:

```ts
/** 통합 등록: 회원 + 정기 스케줄 + 회원권 + 첫 결제(분할 가능). 대표 전용. "결제 없이 회원 없음". */
export async function registerMember(input: {
  name: string; phone: string; birth: string; gender: Gender;
  weekdays: number[]; hour: number;
  product: ProductKey;
  payments: { method: PaymentMethod; amount: number }[];
}): Promise<Result & { memberId?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };
  if (!input.payments.length || input.payments.some((p) => p.amount <= 0))
    return { ok: false, error: "첫 결제 금액을 입력해주세요" };

  const name = input.name.trim();
  const phone = normPhone(input.phone);
  const birthdate = parseBirth(input.birth);
  if (!name) return { ok: false, error: "이름을 입력해주세요" };
  if (!phone) return { ok: false, error: "연락처를 입력해주세요" };
  if (!birthdate) return { ok: false, error: "생년월일을 6자리(YYMMDD)로 입력해주세요" };

  const { data: member, error: memErr } = await sb.from("members").insert({
    name, phone, birthdate, password_hash: hashPassword(input.birth.replace(/\D/g, "")),
    gender: input.gender, status: "active", avatar_tone: "sage",
  }).select("id").single();
  if (memErr || !member) return { ok: false, error: "이미 등록된 연락처이거나 등록에 실패했어요" };

  await sb.from("member_trainers").insert({ member_id: member.id, trainer_id: t.id });
  for (const wd of input.weekdays) {
    const { data: sched } = await sb.from("schedules")
      .insert({ trainer_id: t.id, type: "1on1", weekday: wd, hour: input.hour, active: true })
      .select("id").single();
    if (sched) await sb.from("schedule_members").insert({ schedule_id: sched.id, member_id: member.id });
  }

  // 담당=대표이므로 tier=owner. (등록은 대표가 수행)
  const tier: Tier = tierForRole(t.role);
  const total = PRODUCTS[input.product].sessions;
  const start = todayISO();
  const { data: ms } = await sb.from("memberships").insert({
    member_id: member.id, product: input.product, total_sessions: total, remaining_sessions: total,
    start_date: start, end_date: expiryDate(start, input.product),
    price: priceFor(input.product, tier) || null, list_unit_price: unitListFor(input.product, tier) || null,
    status: "active", guided: false,
  }).select("id").single();
  if (ms) {
    await sb.from("membership_events").insert({ membership_id: ms.id, type: "issue", created_by: t.id });
    for (const p of input.payments)
      await sb.from("payments").insert({ membership_id: ms.id, method: p.method, amount: Math.round(p.amount), paid_at: start, recorded_by: t.id });
  }

  revalidatePath("/t"); revalidatePath("/t/members");
  return { ok: true, memberId: member.id };
}
```

- [ ] **Step 5: 타입체크** — `bunx tsc --noEmit` → `issueMembership` 호출부(`membership/ui.tsx`)가 `"10"|"20"|"30"` 때문에 에러나는 것 확인(Task 7에서 수정). registerMember/recordPayment는 통과.
- [ ] **Step 6: 커밋** — `git add src/lib/data/groups/owner-ops-actions.ts && git commit -m "feat(actions): tier 단가·회차별 만료·분할결제·registerMember 통합"`

---

### Task 7: 발급/등록/결제 UI — 8/16/24 · 분할결제 · 미수금

**Files:**
- Modify: `src/app/(app)/t/members/[id]/membership/ui.tsx` 및 `membership/page.tsx`
- Modify: `src/app/(app)/t/members/register/ui.tsx` 및 `register/page.tsx`
- Modify: `src/app/(app)/t/payment/ui.tsx`

**Interfaces:**
- Consumes: `registerMember`, `issueMembership`, `recordPayment` (Task 6), `getMembershipProducts(tier)` (Task 3), `getMembershipBalance` (Task 5)

- [ ] **Step 1: 발급 화면 상품 union 교체** — `membership/ui.tsx:27`

```ts
import type { ProductKey } from "@/lib/data/products";
// ...
const [selected, setSelected] = useState<ProductKey>("16");
```
그리고 하드코딩된 안내문(`:84` "시작 6/22 · ~9/22 · 잔여 20회 자동 생성")을 선택 상품 기준 동적 문구로:
```tsx
<span className="text-[13px] font-medium text-muted2">
  {`${products.find((p) => p.product === selected)?.label ?? ""} · 발급 시 만료일 자동 계산`}
</span>
```

- [ ] **Step 2: `membership/page.tsx`가 tier 전달** — server component에서 회원 tier로 카탈로그 조회. (현재 `getMembershipProducts()` 호출부에 tier 인자 추가; tier는 `tierForMember` 동등 로직 또는 기본 owner.) 파일 열어 `getMembershipProducts()` → `getMembershipProducts(tier)`로. tier 미상이면 `"owner"`.

- [ ] **Step 3: register 화면에 상품+분할결제 추가** — `register/ui.tsx`. `createMember` import를 `registerMember`로 교체. state 추가:

```ts
import { registerMember } from "@/lib/data/groups/owner-ops-actions";
import type { MembershipProduct, PaymentMethod } from "@/lib/types";
import type { ProductKey } from "@/lib/data/products";
// props에 products: MembershipProduct[] 추가
const [product, setProduct] = useState<ProductKey>("16");
const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([{ method: "card", amount: "" }]);
```
`onSubmit`을 `registerMember`로 교체:
```ts
const res = await registerMember({
  name, phone, birth, gender,
  weekdays: [...days].sort((a, b) => a - b), hour: TIME_OPTIONS[timeIdx],
  product,
  payments: lines.map((l) => ({ method: l.method, amount: Number(l.amount) || 0 })).filter((l) => l.amount > 0),
});
```
요일/시간 블록 아래에 상품 라디오(`products.map`, membership/ui 패턴 재사용)와 "결제 줄" UI(여러 (수단·금액) 입력 + 줄 추가 버튼) 추가. 가격 대비 합계/미수 표시: `미수 = (선택 상품 price) − Σamount`.

- [ ] **Step 4: `register/page.tsx`가 products 전달** — server component에서 `getMembershipProducts("owner")` 조회해 `<MemberRegisterClient products={...} ownerName={...} />`.

- [ ] **Step 5: 결제 화면 분할/혼합 + 미수금** — `payment/ui.tsx`. 단일 method/amount를 결제 줄 배열로. `recordPayment`를 줄별로 호출(각 줄 amount 지정). summary에 `미수금`(getMembershipBalance) 표시. 호출:
```ts
for (const l of lines) await recordPayment({ membershipId: summary.membershipId ?? undefined, memberId: summary.memberId ?? undefined, method: l.method, amount: Number(l.amount) || undefined });
```
`payment/page.tsx`가 `summary`에 미수금(`getMembershipBalance`) 포함하도록 확장.

- [ ] **Step 6: 검증** — `bunx tsc --noEmit` PASS. `bun run build` PASS. 수동 스모크: `bun run dev` → 대표 로그인(owner/test1234) → 회원 등록(상품+분할결제) → 회원권/결제/미수 표시 확인.
- [ ] **Step 7: 커밋** — `git add -A && git commit -m "feat(ui): 8/16/24 발급·통합 등록·분할결제·미수금 표시"`

---

# Phase 2 — 차감 (12시간 규칙: 안내·기본값, 선생님 수동)

### Task 8: 차감 기본값 순수 판정

**Files:**
- Create: `src/lib/data/deduction.ts`
- Test: `src/lib/data/deduction.test.ts`

**Interfaces:**
- Produces:
  - `hoursUntil(scheduledAtISO: string, nowISO: string): number`
  - `defaultDeduct(input: { action: "attend"|"noshow"|"cancel"; initiator: "member"|"trainer"; hoursUntil: number }): boolean`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/deduction.test.ts`

```ts
import { test, expect } from "bun:test";
import { defaultDeduct, hoursUntil } from "./deduction";

test("출석·노쇼는 기본 차감", () => {
  expect(defaultDeduct({ action: "attend", initiator: "member", hoursUntil: 100 })).toBe(true);
  expect(defaultDeduct({ action: "noshow", initiator: "member", hoursUntil: 100 })).toBe(true);
});
test("취소: 회원 사정 & 12시간 미만 → 차감", () => {
  expect(defaultDeduct({ action: "cancel", initiator: "member", hoursUntil: 5 })).toBe(true);
});
test("취소: 12시간 이상 → 미차감", () => {
  expect(defaultDeduct({ action: "cancel", initiator: "member", hoursUntil: 20 })).toBe(false);
});
test("취소: 선생님 사정 → 미차감", () => {
  expect(defaultDeduct({ action: "cancel", initiator: "trainer", hoursUntil: 1 })).toBe(false);
});
test("hoursUntil", () => {
  expect(hoursUntil("2026-06-27T19:00:00Z", "2026-06-27T11:00:00Z")).toBe(8);
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/deduction.test.ts` → FAIL
- [ ] **Step 3: 구현** — `src/lib/data/deduction.ts`

```ts
export function hoursUntil(scheduledAtISO: string, nowISO: string): number {
  return (new Date(scheduledAtISO).getTime() - new Date(nowISO).getTime()) / 3600000;
}

/** 12시간 규칙 기본값(선생님이 토글로 덮어씀). attend/noshow=차감, cancel=회원사정&<12h일 때만. */
export function defaultDeduct(input: {
  action: "attend" | "noshow" | "cancel";
  initiator: "member" | "trainer";
  hoursUntil: number;
}): boolean {
  if (input.action !== "cancel") return true;
  return input.initiator === "member" && input.hoursUntil < 12;
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/deduction.test.ts` → PASS
- [ ] **Step 5: 커밋** — `git add src/lib/data/deduction.ts src/lib/data/deduction.test.ts && git commit -m "feat(deduction): 12시간 차감 기본값 순수 판정"`

---

### Task 9: `confirmAttendance` deduct 파라미터 + `acceptRequest` 정렬

**Files:**
- Modify: `src/lib/data/groups/scheduling-actions.ts:35-73` (`confirmAttendance`), `:131-160` (`acceptRequest`)

**Interfaces:**
- Consumes: `defaultDeduct` (Task 8)
- Produces: `confirmAttendance(sessionId: string, action: AttendanceAction, deduct: boolean): Promise<ActionResult>`

- [ ] **Step 1: `confirmAttendance` 시그니처에 `deduct` 추가** — `:35`. `const deducted = action !== "cancel";`(`:47`)을 `const deducted = deduct;`로 교체. 나머지(차감/ledger) 로직 유지.

```ts
export async function confirmAttendance(
  sessionId: string,
  action: AttendanceAction,
  deduct: boolean,
): Promise<ActionResult> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "권한이 없어요." };
  const statusMap = { attend: "attended", noshow: "noshow", cancel: "cancelled" } as const;
  const deducted = deduct;
  // ... (이하 기존 memberIds 루프·attendance_ledger·sessions update 그대로)
```

- [ ] **Step 2: `acceptRequest`의 cancel 경로도 차감 판단 경유** — `:147` `} else { await sb...status:"cancelled" }`를, 요청자(`requester_type`)·시간으로 `defaultDeduct` 적용 후 차감까지. requester_type은 `schedule_change_requests`에서 select. cancel일 때:

```ts
// req select에 requester_type, original_at 추가
if (req.type === "change") {
  const slots = (req.proposed_slots as string[] | null) ?? [];
  if (slots.length) await sb.from("sessions").update({ scheduled_at: slots[0] }).eq("id", req.session_id);
} else {
  const initiator = req.requester_type === "member" ? "member" : "trainer";
  const h = req.original_at ? hoursUntil(req.original_at, new Date().toISOString()) : 999;
  const deduct = defaultDeduct({ action: "cancel", initiator, hoursUntil: h });
  await confirmAttendance(req.session_id, "cancel", deduct);  // 차감/ledger 일원화
}
```
(상단 import: `import { defaultDeduct, hoursUntil } from "@/lib/data/deduction";`)

- [ ] **Step 3: 검증** — `bunx tsc --noEmit` → `confirmAttendance(t.sessionId, method)` 호출부(`attend/[id]/ui.tsx:87`)가 인자 부족 에러(Task 10에서 수정). 그 외 통과.
- [ ] **Step 4: 커밋** — `git add src/lib/data/groups/scheduling-actions.ts && git commit -m "feat(deduction): confirmAttendance deduct 파라미터 + acceptRequest 일원화"`

---

### Task 10: 출석 화면 차감 토글

**Files:**
- Modify: `src/app/(app)/t/attend/[id]/ui.tsx`, `attend/[id]/page.tsx`, `src/lib/types.ts`(`AttendTarget`)

**Interfaces:**
- Consumes: `defaultDeduct`, `hoursUntil` (Task 8), `confirmAttendance(…, deduct)` (Task 9)

- [ ] **Step 1: `AttendTarget`에 `scheduledAt` 추가** — `types.ts`의 `AttendTarget`에 `scheduledAt: string;`. `attend/[id]/page.tsx`가 세션 `scheduled_at`을 채우도록 수정(getter 확인 후).

- [ ] **Step 2: 토글 상태 + 기본값** — `attend/[id]/ui.tsx`. import: `import { defaultDeduct, hoursUntil } from "@/lib/data/deduction"; import { useMemo } from "react";`

```ts
const [override, setOverride] = useState<boolean | null>(null);
const baseDeduct = useMemo(
  () => defaultDeduct({ action: method, initiator: "member", hoursUntil: hoursUntil(t.scheduledAt, new Date().toISOString()) }),
  [method, t.scheduledAt],
);
const deduct = override ?? baseDeduct;
const after = deduct ? t.remaining - 1 : t.remaining;
```
method 바뀌면 override 초기화: `onClick={() => { setMethod("cancel"); setOverride(null); }}` (세 라디오 모두).

- [ ] **Step 3: cancel 선택 시 차감 토글 + 안내문** — cancel 라디오 아래에:

```tsx
{method !== "attend" && (
  <Card className="mt-3 flex items-center gap-3 px-4 py-3">
    <span className="flex-1 text-[13px] font-medium text-ink-soft">
      {`예정까지 ${Math.max(0, Math.round(hoursUntil(t.scheduledAt, new Date().toISOString())))}시간 · ${baseDeduct ? "정책상 차감 대상" : "차감 없음"}`}
    </span>
    <Switch on={deduct} onChange={(v) => setOverride(v)} label="차감" />
  </Card>
)}
```
(import `Switch`)

- [ ] **Step 4: 제출 시 deduct 전달** — `:87` `await confirmAttendance(t.sessionId, method);` → `await confirmAttendance(t.sessionId, method, deduct);`

- [ ] **Step 5: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 취소+12시간 토글 동작, 노쇼 차감 확인.
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat(ui): 출석 화면 12시간 차감 토글"`

---

# Phase 3 — 라이프사이클 (연장·환불·양도)

### Task 11: 환불 순수 계산

**Files:**
- Create: `src/lib/data/refund.ts`
- Test: `src/lib/data/refund.test.ts`

**Interfaces:**
- Produces: `computeRefund(input: { paidSum:number; totalSessions:number; remainingSessions:number; listUnitPrice:number; penaltyRate?:number }): { used:number; deduction:number; penalty:number; refund:number }`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/refund.test.ts`

```ts
import { test, expect } from "bun:test";
import { computeRefund } from "./refund";

test("환불 = 결제 − 사용회차×정상가 − 결제×10%", () => {
  // 8회 100만 결제, 3회 사용, 1회 정상가 15만 → 100만 − 45만 − 10만 = 45만
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 5, listUnitPrice: 150000 }))
    .toEqual({ used: 3, deduction: 450000, penalty: 100000, refund: 450000 });
});
test("환불액 음수면 0으로 clamp", () => {
  const r = computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 0, listUnitPrice: 150000 });
  expect(r.refund).toBe(0); // 100만 − 8×15만 − 10만 < 0
});
test("사용 0회면 위약금만 차감", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 8, listUnitPrice: 150000 }))
    .toEqual({ used: 0, deduction: 0, penalty: 100000, refund: 900000 });
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/refund.test.ts` → FAIL
- [ ] **Step 3: 구현** — `src/lib/data/refund.ts`

```ts
/** 중도 환불액. 스펙 §5: 결제합계 − 사용회차×1회정상가 − 결제합계×위약금율. */
export function computeRefund(input: {
  paidSum: number; totalSessions: number; remainingSessions: number;
  listUnitPrice: number; penaltyRate?: number;
}) {
  const used = input.totalSessions - input.remainingSessions;
  const deduction = used * input.listUnitPrice;
  const penalty = Math.round(input.paidSum * (input.penaltyRate ?? 0.1));
  const refund = Math.max(0, input.paidSum - deduction - penalty);
  return { used, deduction, penalty, refund };
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/refund.test.ts` → PASS
- [ ] **Step 5: 커밋** — `git add src/lib/data/refund.ts src/lib/data/refund.test.ts && git commit -m "feat(refund): 환불 순수 계산(정상가 차감+위약금 10%)"`

---

### Task 12: 라이프사이클 action — 연장·환불·양도

**Files:**
- Create: `src/lib/data/groups/membership-actions.ts`

**Interfaces:**
- Consumes: `PRODUCTS`, `expiryDate`, `ProductKey` (Task 1), `computeRefund` (Task 11), `getMembershipBalance` (Task 5), `OWNER_ONLY_ERROR`
- Produces:
  - `extendMembership(membershipId: string): Promise<Result>`
  - `refundMembership(input: { membershipId: string; method: PaymentMethod }): Promise<Result & { refund?: number }>`
  - `previewRefund(membershipId: string): Promise<{ ok:boolean; used?:number; deduction?:number; penalty?:number; refund?:number; error?:string }>`
  - `transferMembership(input: { membershipId: string; toMemberId?: string; newMember?: { name; phone; birth; gender: Gender } }): Promise<Result & { toMemberId?: string }>`

- [ ] **Step 1: 파일 생성 — 연장** — `src/lib/data/groups/membership-actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { PRODUCTS, expiryDate, type ProductKey } from "@/lib/data/products";
import { computeRefund } from "@/lib/data/refund";
import { getMembershipBalance } from "@/lib/data/groups/owner-ops";
import type { Gender, PaymentMethod } from "@/lib/types";

type Result = { ok: boolean; error?: string };

async function requireOwner() {
  const t = await getTrainerContext();
  if (!t) return { t: null, err: "로그인이 필요해요" };
  if (t.role !== "owner") return { t: null, err: OWNER_ONLY_ERROR };
  return { t, err: null };
}

/** 연장: 만료일 += 상품기간(무료). 잔여>0일 때만. expired면 active 복귀. */
export async function extendMembership(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("product, end_date, remaining_sessions, status").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if ((ms.remaining_sessions ?? 0) <= 0) return { ok: false, error: "잔여 회차가 없어 연장할 수 없어요" };

  const days = PRODUCTS[ms.product as ProductKey].days;
  // 이미 만료(end_date 과거)면 오늘부터, 아직 유효면 만료일에서 +기간(스택).
  const today = todayISO();
  const base = String(ms.end_date) > today ? String(ms.end_date) : today;
  const newEnd = expiryDate(base, ms.product as ProductKey);
  await sb.from("memberships").update({ end_date: newEnd, status: "active" }).eq("id", membershipId);
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "extend", amount: days, note: `+${days}일`, created_by: t.id });
  revalidatePath("/t");
  return { ok: true };
}
```

- [ ] **Step 2: 환불 미리보기 + 환불** — 같은 파일에 추가

```ts
export async function previewRefund(membershipId: string) {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("total_sessions, remaining_sessions, list_unit_price").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  const bal = await getMembershipBalance(membershipId);
  const r = computeRefund({
    paidSum: bal.paid, totalSessions: ms.total_sessions, remainingSessions: ms.remaining_sessions,
    listUnitPrice: (ms.list_unit_price as number | null) ?? 0,
  });
  return { ok: true, ...r };
}

/** 환불: 음수 결제 행 기록 + status='refunded' + remaining 0 + events. */
export async function refundMembership(input: { membershipId: string; method: PaymentMethod }): Promise<Result & { refund?: number }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const pre = await previewRefund(input.membershipId);
  if (!pre.ok) return { ok: false, error: pre.error };

  if (pre.refund! > 0) {
    await sb.from("payments").insert({
      membership_id: input.membershipId, method: input.method, amount: -pre.refund!,
      paid_at: todayISO(), note: `환불: 사용 ${pre.used}회 정상가 차감 / 위약금 10%`, recorded_by: t.id,
    });
  }
  await sb.from("memberships").update({ status: "refunded", remaining_sessions: 0 }).eq("id", input.membershipId);
  await sb.from("membership_events").insert({
    membership_id: input.membershipId, type: "refund", amount: -pre.refund!,
    note: `환불 ${pre.refund!.toLocaleString()}원(사용 ${pre.used}회·위약금 ${pre.penalty!.toLocaleString()})`, created_by: t.id,
  });
  revalidatePath("/t"); revalidatePath("/t/revenue");
  return { ok: true, refund: pre.refund };
}
```

- [ ] **Step 3: 양도** — 같은 파일에 추가

```ts
/** 양도: 회원권 통째 이전(member_id 교체). 대상=기존 회원 또는 신규 즉시 등록(새 결제 없음). */
export async function transferMembership(input: {
  membershipId: string;
  toMemberId?: string;
  newMember?: { name: string; phone: string; birth: string; gender: Gender };
}): Promise<Result & { toMemberId?: string }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };

  let toId = input.toMemberId;
  if (!toId && input.newMember) {
    const n = input.newMember;
    const phone = n.phone.replace(/\D/g, "");
    const birthdate = `${Number(n.birth.slice(0, 2)) > 30 ? "19" : "20"}${n.birth.slice(0, 2)}-${n.birth.slice(2, 4)}-${n.birth.slice(4, 6)}`;
    const { data: m, error } = await sb.from("members").insert({
      name: n.name.trim(), phone, birthdate, password_hash: hashPassword(n.birth.replace(/\D/g, "")),
      gender: n.gender, status: "active", avatar_tone: "sage",
    }).select("id").single();
    if (error || !m) return { ok: false, error: "양도 대상 등록에 실패했어요(연락처 중복?)" };
    await sb.from("member_trainers").insert({ member_id: m.id, trainer_id: t.id });
    toId = m.id;
  }
  if (!toId) return { ok: false, error: "양도 대상을 선택해주세요" };

  const { data: ms } = await sb.from("memberships").select("member_id").eq("id", input.membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  await sb.from("memberships").update({ member_id: toId }).eq("id", input.membershipId);
  await sb.from("membership_events").insert({ membership_id: input.membershipId, type: "transfer", note: `${ms.member_id} → ${toId}`, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/members");
  return { ok: true, toMemberId: toId };
}
```

- [ ] **Step 4: 검증** — `bunx tsc --noEmit` PASS. (전체 단위 테스트 재확인: `bun test src/lib/data/`.)
- [ ] **Step 5: 커밋** — `git add src/lib/data/groups/membership-actions.ts && git commit -m "feat(lifecycle): extend/refund/transfer + membership_events"`

---

### Task 13: 회원 상세 — 라이프사이클 버튼 + 환불 미리보기 + 양도 + 이력

**Files:**
- Create: `src/app/(app)/t/members/[id]/MembershipActions.tsx` (client)
- Modify: `src/app/(app)/t/members/[id]/page.tsx` (Footer/section에 삽입, membershipId·이력 전달)
- Modify: getter — 회원 상세에 `activeMembershipId` + `events` 포함 (`getMemberDetail` 확장; page.tsx가 import하는 `trainer-home`의 getMemberDetail)

**Interfaces:**
- Consumes: `extendMembership`, `previewRefund`, `refundMembership`, `transferMembership` (Task 12)

- [ ] **Step 1: getter 확장** — 회원 상세 데이터에 `activeMembershipId: string|null`과 최근 `membership_events`(type·note·created_at) 목록 추가. (page.tsx가 쓰는 `getMemberDetail` — `trainer-home.ts` — 를 열어 select에 membership id 포함, events 조회 추가.)

- [ ] **Step 2: `MembershipActions.tsx` 작성** — 대표 전용 액션 묶음. 연장/환불/양도 버튼, 환불은 `previewRefund`로 내역 확인 후 확정, 양도는 기존회원 선택/신규 입력 분기.

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { extendMembership, previewRefund, refundMembership, transferMembership } from "@/lib/data/groups/membership-actions";

export function MembershipActions({ membershipId, canExtend }: { membershipId: string; canExtend: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onExtend() {
    if (busy) return; setBusy(true);
    const r = await extendMembership(membershipId);
    setBusy(false);
    toast(r.ok ? "유효기간을 연장했어요" : r.error ?? "연장 실패");
    if (r.ok) router.refresh();
  }
  async function onRefund() {
    if (busy) return; setBusy(true);
    const p = await previewRefund(membershipId);
    setBusy(false);
    if (!p.ok) { toast(p.error ?? "환불 정보를 불러오지 못했어요"); return; }
    if (!confirm(`환불 ${p.refund!.toLocaleString()}원\n(사용 ${p.used}회 정상가 차감 ${p.deduction!.toLocaleString()} · 위약금 ${p.penalty!.toLocaleString()})\n진행할까요?`)) return;
    setBusy(true);
    const r = await refundMembership({ membershipId, method: "account" });
    setBusy(false);
    toast(r.ok ? `환불 처리했어요(${r.refund!.toLocaleString()}원)` : r.error ?? "환불 실패");
    if (r.ok) router.refresh();
  }
  // 양도: 간단히 기존회원 ID 입력 프롬프트 → 추후 회원 선택 시트로 고도화 (// ponytail: prompt, 회원 선택 UI는 필요 시)
  async function onTransfer() {
    const toMemberId = prompt("양도받을 기존 회원 ID")?.trim();
    if (!toMemberId) return;
    setBusy(true);
    const r = await transferMembership({ membershipId, toMemberId });
    setBusy(false);
    toast(r.ok ? "양도했어요" : r.error ?? "양도 실패");
    if (r.ok) router.push("/t/members");
  }

  return (
    <div className="flex gap-2.5">
      {canExtend && <OutlineButton icon="clock" onClick={onExtend}>연장</OutlineButton>}
      <OutlineButton icon="arrow-right" onClick={onTransfer}>양도</OutlineButton>
      <PrimaryButton icon="coins" onClick={onRefund}>환불</PrimaryButton>
    </div>
  );
}
```
*Note: `confirm`/`prompt`는 브라우저 모달 — PWA에서 동작하나, 추후 인앱 시트로 교체 권장. ponytail: 최소 구현, 회원 선택 시트는 필요 시.*

- [ ] **Step 3: page.tsx에 삽입** — `members/[id]/page.tsx`의 Footer 위 또는 membership 카드 아래에, 대표일 때만(서버에서 role 확인) `<MembershipActions membershipId={m.activeMembershipId} canExtend={m.remaining > 0} />`. 이력 타임라인(events)도 카드로 렌더(type·note·날짜).

- [ ] **Step 4: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 연장(만료일 +기간), 환불(미리보기→음수 결제·매출 반영·상태 refunded), 양도(member_id 이동) 확인.
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat(ui): 회원 상세 연장·환불·양도 + 이력"`

---

# Phase 4 — 알림 (잔여 3회 + 만료 임박, 인앱 우선 확장형)

### Task 14: 알림 임계 순수 판정 + 생성 헬퍼

**Files:**
- Create: `src/lib/data/notify.ts`
- Test: `src/lib/data/notify.test.ts`

**Interfaces:**
- Produces:
  - `LOW_THRESHOLD = 3`, `EXPIRY_DAYS = 7`
  - `isLowSessions(remaining: number, threshold?: number): boolean`
  - `isExpiringSoon(dDay: number, withinDays?: number): boolean`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/notify.test.ts`

```ts
import { test, expect } from "bun:test";
import { isLowSessions, isExpiringSoon } from "./notify";

test("잔여 3회 이하면 low", () => {
  expect(isLowSessions(3)).toBe(true);
  expect(isLowSessions(4)).toBe(false);
  expect(isLowSessions(0)).toBe(true);
});
test("만료 7일 이내(0 이상)면 임박", () => {
  expect(isExpiringSoon(7)).toBe(true);
  expect(isExpiringSoon(8)).toBe(false);
  expect(isExpiringSoon(-1)).toBe(false); // 이미 만료
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/notify.test.ts` → FAIL
- [ ] **Step 3: 구현** — `src/lib/data/notify.ts`

```ts
export const LOW_THRESHOLD = 3;
export const EXPIRY_DAYS = 7;
export const isLowSessions = (remaining: number, threshold = LOW_THRESHOLD) => remaining <= threshold;
export const isExpiringSoon = (dDay: number, withinDays = EXPIRY_DAYS) => dDay >= 0 && dDay <= withinDays;
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/notify.test.ts` → PASS
- [ ] **Step 5: 커밋** — `git add src/lib/data/notify.ts src/lib/data/notify.test.ts && git commit -m "feat(notify): 알림 임계 순수 판정"`

---

### Task 15: 알림 생성기 (잔여 hook + 만료 스캔) + getter

**Files:**
- Create: `src/lib/data/groups/notifications.ts`
- Modify: `src/lib/data/groups/scheduling-actions.ts` (confirmAttendance 차감 후 low 알림)

**Interfaces:**
- Consumes: `isLowSessions`, `isExpiringSoon`, `LOW_THRESHOLD`, `EXPIRY_DAYS` (Task 14)
- Produces:
  - `notifyLowSessions(membershipId: string, memberId: string, remaining: number): Promise<void>`  // dedup: unread 있으면 skip
  - `scanExpiringMemberships(): Promise<{ created: number }>`
  - `getNotifications(recipientType: "member"|"trainer", recipientId: string): Promise<NotificationView[]>`
  - `markNotificationRead(id: string): Promise<void>`

- [ ] **Step 1: 파일 생성 — low 알림 + dedup** — `src/lib/data/groups/notifications.ts`

```ts
import { sb, todayISO, dayDiff } from "@/lib/data/db";
import { isLowSessions, isExpiringSoon, LOW_THRESHOLD } from "@/lib/data/notify";

/** 회원 담당 선생님 id 목록. */
async function trainersOf(memberId: string): Promise<string[]> {
  const { data } = await sb.from("member_trainers").select("trainer_id").eq("member_id", memberId);
  return (data ?? []).map((r) => r.trainer_id as string);
}

async function hasUnread(membershipId: string, type: "low_sessions" | "expiring"): Promise<boolean> {
  const { data } = await sb.from("notifications").select("id")
    .eq("membership_id", membershipId).eq("type", type).eq("status", "unread").limit(1).maybeSingle();
  return !!data;
}

/** 잔여 ≤3 알림(회원 + 담당 선생님). dedup: 같은 회원권 unread 있으면 skip. */
export async function notifyLowSessions(membershipId: string, memberId: string, remaining: number): Promise<void> {
  if (!isLowSessions(remaining)) return;
  if (await hasUnread(membershipId, "low_sessions")) return;
  const common = { type: "low_sessions", title: "잔여 수업 임박", body: `남은 수업이 ${remaining}회예요.`, membership_id: membershipId };
  const rows = [
    { recipient_type: "member", recipient_id: memberId, ...common },
    ...(await trainersOf(memberId)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
  ];
  await sb.from("notifications").insert(rows);
}
```

- [ ] **Step 2: 만료 임박 스캔** — 같은 파일에 추가

```ts
/** 만료 N일 이내 active 회원권 → expiring 알림(회원+선생님). dedup 적용. */
export async function scanExpiringMemberships(): Promise<{ created: number }> {
  const { data: rows } = await sb.from("memberships")
    .select("id, member_id, end_date").eq("status", "active");
  let created = 0;
  for (const m of rows ?? []) {
    const dDay = dayDiff(todayISO(), String(m.end_date));
    if (!isExpiringSoon(dDay)) continue;
    if (await hasUnread(m.id as string, "expiring")) continue;
    const common = { type: "expiring", title: "회원권 만료 임박", body: `만료 D-${dDay}예요.`, membership_id: m.id };
    const inserts = [
      { recipient_type: "member", recipient_id: m.member_id, ...common },
      ...(await trainersOf(m.member_id as string)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
    ];
    await sb.from("notifications").insert(inserts);
    created += inserts.length;
  }
  return { created };
}
```
*실행 트리거: pg_cron 일 1회 권장(별 태스크). 임시로는 트레이너 홈 getter에서 일자 가드로 호출 가능. // ponytail: cron 미설정 시 수동/온로드, 부하 크면 pg_cron로.*

- [ ] **Step 3: getter + read** — 같은 파일에 추가

```ts
export interface NotificationView { id: string; type: string; title: string; body: string | null; createdAt: string; status: string; }

export async function getNotifications(recipientType: "member" | "trainer", recipientId: string): Promise<NotificationView[]> {
  const { data } = await sb.from("notifications").select("id, type, title, body, created_at, status")
    .eq("recipient_type", recipientType).eq("recipient_id", recipientId).eq("channel", "in_app")
    .order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map((n) => ({ id: n.id as string, type: n.type as string, title: n.title as string, body: n.body as string | null, createdAt: n.created_at as string, status: n.status as string }));
}

export async function markNotificationRead(id: string): Promise<void> {
  await sb.from("notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("id", id);
}
```

- [ ] **Step 4: confirmAttendance에 low hook** — `scheduling-actions.ts`의 confirmAttendance 차감 루프에서, 차감 후 `after` 값으로 호출. import: `import { notifyLowSessions } from "@/lib/data/groups/notifications";`. ledger insert 뒤에:

```ts
if (deducted && ms && after != null) await notifyLowSessions(ms.id, memberId, after);
```
(`activeMembership` select에 이미 id 포함. `after`/`ms`/`memberId`는 기존 루프 변수.)

- [ ] **Step 5: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 잔여 4→3 차감 시 알림 행 생성 + 재차감 시 중복 없음(unread dedup). `bun run -e`로 `scanExpiringMemberships()` 1회 실행해 임박 알림 생성 확인.
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat(notify): 잔여/만료 알림 생성기 + 차감 hook + getter"`

---

### Task 16: 알림 노출 (회원 피드 + 선생님 홈)

**Files:**
- Create: `src/app/(app)/m/my/notifications/feed/...` 또는 기존 알림 화면 확장 (회원 인앱 피드)
- Modify: 선생님 홈/관리 화면에서 `getNotifications("trainer", trainerId)` 노출
- Modify: 회원 home getter — 잔여/만료 알림을 배너로

**Interfaces:**
- Consumes: `getNotifications`, `markNotificationRead` (Task 15)

- [ ] **Step 1: 회원 알림 피드** — 회원 컨텍스트(`getMemberContext`)로 `getNotifications("member", memberId)` 조회해 목록 렌더. 항목 탭 시 `markNotificationRead`. 기존 알림 **설정 토글**(쿠키)이 off면 표시 억제(설정 키와 매핑). 회원 홈(`m/page.tsx`/`member.ts`)에 미읽음 있으면 배너.

- [ ] **Step 2: 선생님 노출** — 트레이너 홈(`t/page.tsx` 또는 관리 섹션)에서 `getNotifications("trainer", trainerId)`의 미읽음을 "관리 필요" 목록에 합류. 기존 expiring 신호(`trainer-home.ts:145`)와 중복되지 않게 알림 기반으로 일원화하거나 병기.

- [ ] **Step 3: 검증** — `bun run build` PASS. 수동: 회원/선생님 각각 알림 노출·읽음 처리 확인.
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat(ui): 회원/선생님 알림 노출 + 읽음 처리"`

---

## (선택) Task 17: 만료 알림 cron

만료 임박은 일 1회 스캔이 자연스럽다. Supabase `pg_cron`으로 `scanExpiringMemberships`에 해당하는 SQL을 매일 호출하거나, edge function로 래핑. 미설정 시 Task 15의 온로드 throttle로 대체. (스펙 §6 — 구현 단계에서 선택.)

---

## 검증 요약 (전체)

- 단위 테스트: `bun test src/lib/data/` → products·balance·deduction·refund·notify 전부 PASS.
- 타입: `bunx tsc --noEmit` 클린.
- 빌드: `bun run build` 성공.
- 마이그레이션: `notifications`·`membership_events` 존재, `memberships.list_unit_price` 컬럼, `membership_status`에 `refunded`.
- 수동 스모크(대표 owner/test1234): 등록(분할결제·미수금) → 출석 차감(12h 토글) → 잔여3 알림 → 연장 → 환불(매출 음수) → 양도.

## TBD (대표 확인 후 코드 반영)

- `products.ts` 12개 숫자: 8/16/24 판매가(owner/instructor) + 1회 정상가(owner/instructor). **0인 동안 가격·환불 계산이 0**이 되므로, 실데이터 전 반드시 입력.
- 만료 임박 기준일 `EXPIRY_DAYS`(기본 7).
