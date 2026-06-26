# 회원권 라이프사이클 Implementation Plan (개정 — origin/main 기준)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 구현된 trainer-ops(상품 테이블·통합 등록·차감 정책) 위에, 회원권 **연장·환불·양도·미수금/분할결제 UI·잔여3회/만료 알림**을 추가한다.

**Architecture:** origin/main(`a8a15ae`)에 `membership_products`·`studio_settings`·`shouldDeduct`가 이미 있다. 신규는 `membership_events`·`notifications` 테이블 2개 + 순수 로직(미수금·환불·알림임계) TDD + action/UI. 분할결제는 기존 `recordPayment({amount})`를 멀티라인 UI로, 차감 12시간은 `cancel_cutoff_hours=12` 설정으로 끝낸다.

**Tech Stack:** Next.js 16.2.9, React 19, Supabase(Postgres, service-role), Bun(test/build), Tailwind v4.

스펙: `../specs/2026-06-27-membership-lifecycle-design.md`(개정 헤더 참조). 브랜치: `membership-lifecycle`(origin/main 리베이스됨).

## Global Constraints

- **테스트**: test 스크립트 없음. `bun test <파일>`, `import { test, expect } from "bun:test"`, `*.test.ts` colocate.
- **타입체크/빌드**: `bunx tsc --noEmit`, `bun run build`. 스크립트 `bun run scripts/X.ts`.
- **Next.js 16은 학습 데이터와 다름**: 새 패턴 전 `node_modules/next/dist/docs/` 확인.
- **데이터 접근**: 서버 `sb`(`@/lib/data/db`). server action 상단 `"use server"`. 대표 가드: `if (t.role !== "owner") return { ok:false, error: OWNER_ONLY_ERROR }`(`@/lib/auth/guard`).
- **이미 존재(재사용, 새로 만들지 말 것)**: `membership_products`(+`createProduct/updateProduct/setProductActive`), `studio_settings`(+`updatePolicy/updateNotifications`), `issueMembership(memberId, productId)`, `recordPayment({memberId?,membershipId?,method,amount?,paidAt?})`, `createMember({...,product?,payment?})`, `shouldDeduct(action,scheduledAt,settings)`(`@/lib/data/deduction` — **재생성 금지**).
- **마이그레이션**: 다음 번호 = **0005**(0003·0004 이미 적용됨). 추가·idempotent. 적용 = Bun.SQL(psql 미설치). 운영 DB 직접 적용(사용자 승인됨).
- **UI 한국어**, 회원 대상 호칭 **선생님**, `dark:` 금지.
- **돈/감사**: 차감=`attendance_ledger`, 라이프사이클=`membership_events`, 결제·환불=`payments` 행. 환불=음수 행.
- 커밋 자주. 메시지 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: 마이그레이션 0005 + 적용 (스키마·상품데이터·차감설정)

**Files:**
- Create: `supabase/migrations/0005_membership_lifecycle.sql`
- Create: `scripts/apply-migration.ts`

- [ ] **Step 1: 마이그레이션 SQL** — `supabase/migrations/0005_membership_lifecycle.sql`

```sql
-- 회원권 라이프사이클: 환불 상태, 정상가, 이력/알림 테이블, 8/16/24 상품(대표/강사), 차감 12h.
alter type membership_status add value if not exists 'refunded';

-- 1회 정상가(비할인, 환불 차감용): 상품에 기본값, 회원권에 발급 시점 스냅샷
alter table membership_products add column if not exists unit_list_price int not null default 0;
alter table memberships add column if not exists list_unit_price int;

-- 회원권 이력(연장·양도·환불 등 payments에 안 남는 동작)
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

-- 알림(인앱 우선, channel=확장 seam)
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

-- 기존 10/20/30 상품 비활성화(과거 회원권 참조 보존)
update membership_products set active = false where sessions in (10, 20, 30);

-- 8/16/24 × 대표/강사 6종 (가격·정상가 TBD=0, 대표가 상품화면에서 채움). 이름으로 idempotent.
insert into membership_products (name, sessions, price, duration_days, unit_list_price, sort_order, active)
select * from (values
  ('8회권 (대표)',  8,  0, 30, 0, 1, true),
  ('8회권 (강사)',  8,  0, 30, 0, 2, true),
  ('16회권 (대표)', 16, 0, 60, 0, 3, true),
  ('16회권 (강사)', 16, 0, 60, 0, 4, true),
  ('24회권 (대표)', 24, 0, 90, 0, 5, true),
  ('24회권 (강사)', 24, 0, 90, 0, 6, true)
) as v(name, sessions, price, duration_days, unit_list_price, sort_order, active)
where not exists (select 1 from membership_products mp where mp.name = v.name);

-- 차감 정책: 취소 12시간 기준(기존 0=항상 미차감일 때만 설정, 대표 변경 보존)
update studio_settings set cancel_cutoff_hours = 12 where id = 1 and cancel_cutoff_hours = 0;
```

- [ ] **Step 2: 적용 스크립트** — `scripts/apply-migration.ts`

```ts
// 마이그레이션을 Supabase Postgres에 직접 적용(psql 미설치 → Bun.SQL).
// 실행:  set -a; . ./.env.deploy.local; set +a; bun run scripts/apply-migration.ts supabase/migrations/0005_membership_lifecycle.sql
import { SQL } from "bun";
const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: bun run scripts/apply-migration.ts <file.sql> [...]");
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("missing SUPABASE_DB_URL — `set -a; . ./.env.deploy.local; set +a` 먼저");
const sql = new SQL(url);
for (const f of files) { console.log(`→ applying ${f}`); await sql.unsafe(await Bun.file(f).text()); }
await sql.end();
console.log("done");
```

- [ ] **Step 3: 적용** — 터미널:

```bash
set -a; . ./.env.deploy.local; set +a
bun run scripts/apply-migration.ts supabase/migrations/0005_membership_lifecycle.sql
```
Expected: `→ applying ...` / `done`. (`ALTER TYPE ... ADD VALUE cannot run inside a transaction block` 에러 시 그 한 줄만 분리 적용.)

- [ ] **Step 4: 검증** — 한 줄 스모크:

```bash
set -a; . ./.env.deploy.local; set +a
bun -e 'import{SQL}from"bun";const s=new SQL(process.env.SUPABASE_DB_URL);console.log(await s.unsafe("select count(*) active8 from membership_products where active and sessions in (8,16,24)"));console.log(await s.unsafe("select to_regclass('"'"'public.notifications'"'"') n, to_regclass('"'"'public.membership_events'"'"') e"));console.log(await s.unsafe("select cancel_cutoff_hours from studio_settings where id=1"));await s.end()'
```
Expected: active8=6, n·e non-null, cancel_cutoff_hours=12.

- [ ] **Step 5: 커밋** — `git add supabase/migrations/0005_membership_lifecycle.sql scripts/apply-migration.ts && git commit -m "feat(db): 0005 lifecycle migration — events/notifications/정상가, 8·16·24 상품, cutoff 12"`

---

### Task 2: 발급 정상가 스냅샷 + 상품 관리(정상가) + 타입

**Files:**
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`issueMembership`, `createProduct`, `updateProduct`)
- Modify: `src/app/(app)/t/settings/products/ui.tsx` (정상가 입력 — 현재 파일 먼저 읽고 price 옆에 추가)
- Modify: `src/lib/types.ts` (`MembershipProduct.unitListPrice`, `Membership.status` += refunded)

**Interfaces:**
- Produces: `issueMembership`이 `memberships.list_unit_price`를 상품 `unit_list_price`로 채움. `createProduct/updateProduct`가 `unitListPrice` 받음.

- [ ] **Step 1: `issueMembership` 정상가 스냅샷** — `owner-ops-actions.ts:106` select에 `unit_list_price` 추가, insert에 `list_unit_price` 추가:

```ts
  const { data: prod } = await sb
    .from("membership_products")
    .select("id, sessions, price, duration_days, name, unit_list_price")
    .eq("id", productId)
    .maybeSingle();
  // ... memberships insert 객체에 추가:
      list_unit_price: prod.unit_list_price ?? 0,
```

- [ ] **Step 2: `createProduct`/`updateProduct`에 정상가** — 두 함수 input에 `unitListPrice: number` 추가, insert/update에 `unit_list_price: input.unitListPrice`.

- [ ] **Step 3: 상품 관리 UI** — `t/settings/products/ui.tsx`를 읽고, 가격 입력 옆에 "1회 정상가(환불 기준)" 입력 추가, create/update 호출에 `unitListPrice` 전달. (필드 패턴은 기존 price 입력 복제.)

- [ ] **Step 4: 타입** — `types.ts`: `MembershipProduct`에 `unitListPrice: number;`, `Membership.status`를 `"active" | "expired" | "refunded"`로.

- [ ] **Step 5: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 상품화면에서 8회권(대표) 가격·정상가 입력→저장 확인.
- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat(products): 1회 정상가 입력·발급 스냅샷 + status refunded"`

---

### Task 3: 미수금 순수 계산 + getter

**Files:**
- Create: `src/lib/data/balance.ts`, `src/lib/data/balance.test.ts`
- Modify: `src/lib/data/groups/owner-ops.ts` (getter 추가)

**Interfaces:**
- Produces: `outstanding(price:number|null, amounts:number[]):number`, `paidInFull(price:number|null, amounts:number[]):boolean`, `getMembershipBalance(membershipId:string):Promise<{price:number|null; paid:number; outstanding:number; paidInFull:boolean}>`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/balance.test.ts`

```ts
import { test, expect } from "bun:test";
import { outstanding, paidInFull } from "./balance";

test("미수금 = 가격 − 양수 결제 합계", () => {
  expect(outstanding(1300000, [1000000])).toBe(300000);
});
test("음수(환불) 결제는 제외, 완납/과납은 0", () => {
  expect(outstanding(1300000, [1300000, -500000])).toBe(0);
  expect(outstanding(1000000, [1200000])).toBe(0);
});
test("price null이면 0", () => {
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
export function outstanding(price: number | null, amounts: number[]): number {
  if (price == null) return 0;
  return Math.max(0, price - sumPositive(amounts));
}
export function paidInFull(price: number | null, amounts: number[]): boolean {
  if (price == null) return true;
  return sumPositive(amounts) >= price;
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/balance.test.ts` → PASS
- [ ] **Step 5: getter** — `owner-ops.ts` 끝에 (상단 `import { outstanding, paidInFull } from "@/lib/data/balance";`):

```ts
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

### Task 4: 결제 화면 분할/혼합 + 미수금 표시

**Files:**
- Modify: `src/app/(app)/t/payment/ui.tsx`, `src/app/(app)/t/payment/page.tsx`
- Modify: `src/lib/data/groups/owner-ops.ts` (`PaymentSummary`에 미수금 포함 — 현재 정의 읽고 추가)

**Interfaces:**
- Consumes: `recordPayment({amount, paidAt})`(기존), `getMembershipBalance`(Task 3)

- [ ] **Step 1: `PaymentSummary`에 잔액** — `owner-ops.ts`의 `PaymentSummary` 타입과 그 getter를 읽고, `outstanding`/`price`/`paid`를 포함하도록 `getMembershipBalance`로 채운다.

- [ ] **Step 2: 결제 화면 멀티라인** — `payment/ui.tsx`. 단일 `method`/`amount`를 결제 줄 배열로:

```ts
const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([
  { method: "card", amount: summary.outstanding != null ? String(summary.outstanding) : (summary.amount != null ? String(summary.amount) : "") },
]);
```
줄별 (수단 토글 + 금액) UI + "결제 줄 추가" 버튼. 합계·미수 표시: `미수 = (summary.price ?? 0) − Σ기존결제 − Σ이번입력`. `onRecord`에서 줄마다 `recordPayment` 호출:

```ts
for (const l of lines) {
  const amt = Number(l.amount.replace(/[^\d]/g, "")) || 0;
  if (amt <= 0) continue;
  const r = await recordPayment({ memberId: summary.memberId ?? undefined, membershipId: summary.membershipId ?? undefined, method: l.method, amount: amt, paidAt: payDate || undefined });
  if (!r.ok) { toast(r.error ?? "결제 기록 실패"); setPending(false); return; }
}
```

- [ ] **Step 3: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 카드+현금 2줄 결제 → payments 2행, 미수금 갱신 확인.
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat(payment): 분할·혼합결제 멀티라인 + 미수금 표시"`

---

### Task 5: 환불 순수 계산 + 라이프사이클 action(연장·환불·양도)

**Files:**
- Create: `src/lib/data/refund.ts`, `src/lib/data/refund.test.ts`
- Create: `src/lib/data/groups/membership-actions.ts`

**Interfaces:**
- Consumes: `getMembershipBalance`(Task 3), `OWNER_ONLY_ERROR`, `hashPassword`
- Produces:
  - `computeRefund({paidSum,totalSessions,remainingSessions,listUnitPrice,penaltyRate?}):{used,deduction,penalty,refund}`
  - `extendMembership(membershipId):Promise<Result>`
  - `previewRefund(membershipId):Promise<{ok;used?;deduction?;penalty?;refund?;error?}>`
  - `refundMembership({membershipId,method}):Promise<Result&{refund?}>`
  - `transferMembership({membershipId,toMemberId?,newMember?}):Promise<Result&{toMemberId?}>`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/refund.test.ts`

```ts
import { test, expect } from "bun:test";
import { computeRefund } from "./refund";

test("환불 = 결제 − 사용회차×정상가 − 결제×10%", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 5, listUnitPrice: 150000 }))
    .toEqual({ used: 3, deduction: 450000, penalty: 100000, refund: 450000 });
});
test("음수면 0 clamp", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 0, listUnitPrice: 150000 }).refund).toBe(0);
});
test("사용 0회 = 위약금만", () => {
  expect(computeRefund({ paidSum: 1000000, totalSessions: 8, remainingSessions: 8, listUnitPrice: 150000 }))
    .toEqual({ used: 0, deduction: 0, penalty: 100000, refund: 900000 });
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/refund.test.ts` → FAIL
- [ ] **Step 3: 구현** — `src/lib/data/refund.ts`

```ts
/** 중도 환불액. 결제합계 − 사용회차×1회정상가 − 결제합계×위약금율(10%). */
export function computeRefund(input: {
  paidSum: number; totalSessions: number; remainingSessions: number; listUnitPrice: number; penaltyRate?: number;
}) {
  const used = input.totalSessions - input.remainingSessions;
  const deduction = used * input.listUnitPrice;
  const penalty = Math.round(input.paidSum * (input.penaltyRate ?? 0.1));
  const refund = Math.max(0, input.paidSum - deduction - penalty);
  return { used, deduction, penalty, refund };
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/refund.test.ts` → PASS
- [ ] **Step 5: 라이프사이클 action** — `src/lib/data/groups/membership-actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO } from "@/lib/data/db";
import { OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
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

/** start + 일수 → "YYYY-MM-DD" */
function addDays(startISO: string, days: number): string {
  return new Date(new Date(startISO + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
}

/** 연장: 만료일 += 상품 duration_days(무료). 잔여>0일 때만. expired면 active 복귀. */
export async function extendMembership(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("end_date, remaining_sessions, product_id").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  if ((ms.remaining_sessions ?? 0) <= 0) return { ok: false, error: "잔여 회차가 없어 연장할 수 없어요" };
  const { data: prod } = await sb.from("membership_products").select("duration_days").eq("id", ms.product_id).maybeSingle();
  const days = prod?.duration_days ?? 30;
  const today = todayISO();
  const base = String(ms.end_date) > today ? String(ms.end_date) : today; // 만료됐으면 오늘부터
  await sb.from("memberships").update({ end_date: addDays(base, days), status: "active" }).eq("id", membershipId);
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "extend", amount: days, note: `+${days}일`, created_by: t.id });
  revalidatePath("/t"); revalidatePath(`/t/members`);
  return { ok: true };
}

export async function previewRefund(membershipId: string) {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const { data: ms } = await sb.from("memberships")
    .select("total_sessions, remaining_sessions, list_unit_price").eq("id", membershipId).maybeSingle();
  if (!ms) return { ok: false, error: "회원권을 찾을 수 없어요" };
  const bal = await getMembershipBalance(membershipId);
  return { ok: true, ...computeRefund({ paidSum: bal.paid, totalSessions: ms.total_sessions, remainingSessions: ms.remaining_sessions, listUnitPrice: (ms.list_unit_price as number | null) ?? 0 }) };
}

/** 환불: 음수 결제 행 + status refunded + remaining 0 + events. */
export async function refundMembership(input: { membershipId: string; method: PaymentMethod }): Promise<Result & { refund?: number }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const pre = await previewRefund(input.membershipId);
  if (!pre.ok) return { ok: false, error: pre.error };
  if (pre.refund! > 0) {
    await sb.from("payments").insert({ membership_id: input.membershipId, method: input.method, amount: -pre.refund!, paid_at: todayISO(), note: `환불: 사용 ${pre.used}회 정상가 차감 / 위약금 10%`, recorded_by: t.id });
  }
  await sb.from("memberships").update({ status: "refunded", remaining_sessions: 0 }).eq("id", input.membershipId);
  await sb.from("membership_events").insert({ membership_id: input.membershipId, type: "refund", amount: -pre.refund!, note: `환불 ${pre.refund!.toLocaleString()}원(사용 ${pre.used}회·위약금 ${pre.penalty!.toLocaleString()})`, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/revenue"); revalidatePath("/t/members");
  return { ok: true, refund: pre.refund };
}

/** 양도: 회원권 통째 이전(member_id 교체). 대상=기존 회원 또는 신규 즉시 등록(새 결제 없음). */
export async function transferMembership(input: { membershipId: string; toMemberId?: string; newMember?: { name: string; phone: string; birth: string; gender: Gender } }): Promise<Result & { toMemberId?: string }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  let toId = input.toMemberId;
  if (!toId && input.newMember) {
    const n = input.newMember;
    const phone = n.phone.replace(/\D/g, "");
    const birthdate = `${Number(n.birth.slice(0, 2)) > 30 ? "19" : "20"}${n.birth.slice(0, 2)}-${n.birth.slice(2, 4)}-${n.birth.slice(4, 6)}`;
    const { data: m, error } = await sb.from("members").insert({ name: n.name.trim(), phone, birthdate, password_hash: hashPassword(n.birth.replace(/\D/g, "")), gender: n.gender, status: "active", avatar_tone: "sage" }).select("id").single();
    if (error || !m) return { ok: false, error: "양도 대상 등록 실패(연락처 중복?)" };
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

- [ ] **Step 6: 검증** — `bunx tsc --noEmit` PASS, `bun test src/lib/data/` PASS.
- [ ] **Step 7: 커밋** — `git add src/lib/data/refund.* src/lib/data/groups/membership-actions.ts && git commit -m "feat(lifecycle): computeRefund + extend/refund/transfer actions"`

---

### Task 6: 회원 상세 — 라이프사이클 버튼 + 이력

**Files:**
- Create: `src/app/(app)/t/members/[id]/MembershipActions.tsx`
- Modify: `src/app/(app)/t/members/[id]/page.tsx`
- Modify: `src/lib/data/groups/trainer-home.ts` (`getMemberDetail`에 `activeMembershipId` + 최근 events 추가) + `MemberDetailView` 타입

**Interfaces:**
- Consumes: `extendMembership`, `previewRefund`, `refundMembership`, `transferMembership`(Task 5)

- [ ] **Step 1: getter 확장** — `trainer-home.ts`의 `getMemberDetail`을 읽고, 반환에 `activeMembershipId: string|null`과 `events: {type:string; note:string|null; createdAt:string}[]`(membership_events 최근 5건, 활성 회원권 기준) 추가. `MemberDetailView`(types.ts:202~) 타입에도 두 필드 추가.

- [ ] **Step 2: `MembershipActions.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineButton, PrimaryButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { extendMembership, previewRefund, refundMembership, transferMembership } from "@/lib/data/groups/membership-actions";

export function MembershipActions({ membershipId, canExtend }: { membershipId: string; canExtend: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundDesc, setRefundDesc] = useState("");

  async function onExtend() {
    if (busy) return; setBusy(true);
    const r = await extendMembership(membershipId); setBusy(false);
    toast(r.ok ? "유효기간을 연장했어요" : r.error ?? "연장 실패");
    if (r.ok) router.refresh();
  }
  async function openRefund() {
    const p = await previewRefund(membershipId);
    if (!p.ok) { toast(p.error ?? "환불 정보를 불러오지 못했어요"); return; }
    setRefundDesc(`환불 ${p.refund!.toLocaleString()}원 (사용 ${p.used}회 정상가 차감 ${p.deduction!.toLocaleString()} · 위약금 ${p.penalty!.toLocaleString()})`);
    setRefundOpen(true);
  }
  async function doRefund() {
    setRefundOpen(false); setBusy(true);
    const r = await refundMembership({ membershipId, method: "account" }); setBusy(false);
    toast(r.ok ? `환불 처리했어요 (${r.refund!.toLocaleString()}원)` : r.error ?? "환불 실패");
    if (r.ok) router.refresh();
  }
  async function onTransfer() {
    const toMemberId = prompt("양도받을 기존 회원 ID")?.trim(); // ponytail: prompt, 회원 선택 시트는 필요 시
    if (!toMemberId) return;
    setBusy(true);
    const r = await transferMembership({ membershipId, toMemberId }); setBusy(false);
    toast(r.ok ? "양도했어요" : r.error ?? "양도 실패");
    if (r.ok) router.push("/t/members");
  }

  return (
    <>
      <div className="flex gap-2.5">
        {canExtend && <OutlineButton icon="clock" onClick={onExtend}>연장</OutlineButton>}
        <OutlineButton icon="arrow-right" onClick={onTransfer}>양도</OutlineButton>
        <PrimaryButton icon="coins" onClick={openRefund}>환불</PrimaryButton>
      </div>
      <ConfirmDialog open={refundOpen} title="환불을 진행할까요?" description={refundDesc} confirmLabel="환불" onConfirm={doRefund} onCancel={() => setRefundOpen(false)} />
    </>
  );
}
```
*`prompt`/`ConfirmDialog`: ConfirmDialog는 기존 컴포넌트(payment/ui에서 사용). prompt는 브라우저 모달(시스템 reminder상 dialog 주의 — 최소 구현, 추후 인앱 시트 권장).*

- [ ] **Step 3: page.tsx 삽입** — `members/[id]/page.tsx` Footer 안 기존 버튼 그룹 아래에, `m.activeMembershipId`가 있을 때만 `<MembershipActions membershipId={m.activeMembershipId} canExtend={m.remaining > 0} />`. 이력은 membership 카드 아래 `m.events`를 작은 목록 카드로(type 라벨+note+날짜).

- [ ] **Step 4: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 연장(만료일 변화), 환불(미리보기→음수결제·refunded·매출 반영), 양도(member_id 이동).
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat(ui): 회원 상세 연장·환불·양도 + 이력"`

---

### Task 7: 알림 임계 순수 판정 + 생성기 + getter

**Files:**
- Create: `src/lib/data/notify.ts`, `src/lib/data/notify.test.ts`
- Create: `src/lib/data/groups/notifications.ts`
- Modify: `src/lib/data/groups/scheduling-actions.ts` (차감 후 low 알림)

**Interfaces:**
- Produces: `isLowSessions(remaining,t?)`, `isExpiringSoon(dDay,within?)`, `LOW_THRESHOLD=3`, `EXPIRY_DAYS=7`, `notifyLowSessions(membershipId,memberId,remaining)`, `scanExpiringMemberships()`, `getNotifications(type,id)`, `markNotificationRead(id)`

- [ ] **Step 1: 실패 테스트** — `src/lib/data/notify.test.ts`

```ts
import { test, expect } from "bun:test";
import { isLowSessions, isExpiringSoon } from "./notify";
test("잔여 3 이하 low", () => { expect(isLowSessions(3)).toBe(true); expect(isLowSessions(4)).toBe(false); });
test("만료 7일 이내(0이상) 임박", () => { expect(isExpiringSoon(7)).toBe(true); expect(isExpiringSoon(8)).toBe(false); expect(isExpiringSoon(-1)).toBe(false); });
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
- [ ] **Step 5: 생성기 + getter** — `src/lib/data/groups/notifications.ts` (studio_settings 토글 존중: notif_session=잔여, notif_expiry=만료)

```ts
import { sb, todayISO, dayDiff } from "@/lib/data/db";
import { isLowSessions, isExpiringSoon } from "@/lib/data/notify";

async function settings() {
  const { data } = await sb.from("studio_settings").select("notif_session, notif_expiry").eq("id", 1).maybeSingle();
  return { session: data?.notif_session ?? true, expiry: data?.notif_expiry ?? true };
}
async function trainersOf(memberId: string): Promise<string[]> {
  const { data } = await sb.from("member_trainers").select("trainer_id").eq("member_id", memberId);
  return (data ?? []).map((r) => r.trainer_id as string);
}
async function hasUnread(membershipId: string, type: "low_sessions" | "expiring"): Promise<boolean> {
  const { data } = await sb.from("notifications").select("id").eq("membership_id", membershipId).eq("type", type).eq("status", "unread").limit(1).maybeSingle();
  return !!data;
}

/** 잔여 ≤3 알림(회원+담당 선생님). dedup: 같은 회원권 unread 있으면 skip. */
export async function notifyLowSessions(membershipId: string, memberId: string, remaining: number): Promise<void> {
  if (!isLowSessions(remaining)) return;
  if (!(await settings()).session) return;
  if (await hasUnread(membershipId, "low_sessions")) return;
  const common = { type: "low_sessions", title: "잔여 수업 임박", body: `남은 수업이 ${remaining}회예요.`, membership_id: membershipId };
  const rows = [
    { recipient_type: "member", recipient_id: memberId, ...common },
    ...(await trainersOf(memberId)).map((tid) => ({ recipient_type: "trainer", recipient_id: tid, ...common })),
  ];
  await sb.from("notifications").insert(rows);
}

/** 만료 N일 이내 active 회원권 → expiring 알림. dedup 적용. */
export async function scanExpiringMemberships(): Promise<{ created: number }> {
  if (!(await settings()).expiry) return { created: 0 };
  const { data: rows } = await sb.from("memberships").select("id, member_id, end_date").eq("status", "active");
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

- [ ] **Step 6: 차감 hook** — `scheduling-actions.ts`의 `confirmAttendance` 차감 루프에서 차감 후 호출. 현재 코드(deducted 분기·attendance_ledger insert)를 읽고, ledger insert 뒤에 (상단 `import { notifyLowSessions } from "@/lib/data/groups/notifications";`):

```ts
if (deducted && ms && after != null) await notifyLowSessions(ms.id, memberId, after);
```
*확인: 현재 `confirmAttendance`가 활성 회원권 id(`ms.id`)·차감후값(`after`)·`memberId`를 루프에서 들고 있는지 읽고, 없으면 select에 `id` 추가.*

- [ ] **Step 7: 검증** — `bunx tsc --noEmit` PASS, `bun run build` PASS. 수동: 잔여 4→3 차감 시 notifications 2행(회원+선생님), 재차감 dedup. `bun -e`로 `scanExpiringMemberships()` 실행해 임박 알림 확인.
- [ ] **Step 8: 커밋** — `git add -A && git commit -m "feat(notify): 잔여/만료 알림 생성기 + 차감 hook + getter"`

---

### Task 8: 알림 노출 (회원 + 선생님)

**Files:**
- Modify/Create: 회원 알림 화면 (`m/my/notifications` 또는 신규 피드) — 현재 파일 읽고 결정
- Modify: 선생님 홈/관리 화면에서 미읽음 알림 노출

**Interfaces:**
- Consumes: `getNotifications`, `markNotificationRead`(Task 7)

- [ ] **Step 1: 회원 알림 피드** — 회원 컨텍스트(`getMemberContext`)로 `getNotifications("member", memberId)` 조회 렌더, 탭 시 `markNotificationRead`. 회원 홈에 미읽음 배지/배너.

- [ ] **Step 2: 선생님 노출** — 트레이너 홈/관리 화면에서 `getNotifications("trainer", trainerId)` 미읽음을 목록으로.

- [ ] **Step 3: 검증** — `bun run build` PASS. 수동: 회원·선생님 알림 노출·읽음 처리.
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat(ui): 회원/선생님 알림 노출 + 읽음 처리"`

---

## 검증 요약

- 단위: `bun test src/lib/data/` → balance·refund·notify PASS (+기존 deduction 유지).
- 타입/빌드: `bunx tsc --noEmit`, `bun run build` 클린.
- 마이그레이션: 8/16/24×대표/강사 6 상품 active, notifications·membership_events 존재, cancel_cutoff_hours=12, memberships.list_unit_price.
- 수동(owner): 상품가격·정상가 입력 → 발급(통합등록 또는 발급화면) → 분할결제·미수금 → 출석 차감(12h 자동) → 잔여3 알림 → 연장 → 환불(매출 음수) → 양도.

## TBD (대표 확인 후 상품화면에서 입력)

- 8/16/24 × 대표/강사 **판매가** + **1회 정상가**(환불용) = 12개 숫자. 입력 전엔 0이라 환불·결제 계산이 0.
- 만료 임박 기준일 `EXPIRY_DAYS`(기본 7), 잔여 임계 `LOW_THRESHOLD`(기본 3).
