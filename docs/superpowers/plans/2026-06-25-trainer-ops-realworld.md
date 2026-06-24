# 실무용 대표 트레이너 기능 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대표 트레이너가 회원권 판매·결제·정책·기록을 실무에서 막힘없이 처리하도록 8개 영역을 개선한다.

**Architecture:** 마이그레이션 1개(`0003_ops.sql`)로 상품 카탈로그·운영 설정·운동 종목 테이블 추가. 데이터 계층(server actions)을 Phase 1에서 전부 확정해 서버 계약을 고정한 뒤, 파일이 겹치지 않는 3개 UI 워크스트림을 병렬 실행, 마지막에 독립 검증.

**Tech Stack:** Next.js(App Router, 커스텀 빌드 — `node_modules/next/dist/docs/` 우선 확인), React, TypeScript, Supabase(service-role, RLS deny-by-default), Bun(`bun run build`, `bun test`), Tailwind v4(`@theme` 고정 hex, light-only).

## Global Constraints

- Bun 사용: `bun test`, `bun run build`, `bun <file>`. node/npm/jest/vitest 금지.
- 다크모드 금지: `dark:`/`prefers-color-scheme: dark` 추가 금지. 토큰은 `@theme` 고정 hex.
- 회원 대면 카피는 **선생님**(코치/트레이너 아님). 트레이너측 역할 라벨(대표/강사)은 유지.
- 신규 테이블은 RLS enable(deny-by-default). 데이터 접근은 service-role + 코드 스코핑.
- owner 전용 액션은 `ensureOwner()`/role 체크 필수(`src/lib/auth/guard.ts` 패턴). 데이터 getter는 가드된 페이지에서만 호출.
- KST 시각 처리는 `src/lib/data/db.ts`/`kst-bounds.ts` 헬퍼 사용.
- 커밋은 작업 단위로 자주. 브랜치: `feat/trainer-ops-realworld`(이미 생성됨).

---

# Phase 1 — 기반 (순차, 단일 에이전트)

> Phase 1은 빌드를 항상 green으로 유지한다. 시그니처를 바꾸면 깨지는 호출부를 **같은 태스크에서 최소 수정**한다(특히 `issueMembership` → `src/app/(app)/t/members/[id]/membership/ui.tsx`).

### Task 1.1: 마이그레이션 `0003_ops.sql`

**Files:**
- Create: `supabase/migrations/0003_ops.sql`

**Produces:** 테이블 `membership_products`, `studio_settings`(단일행), `exercises`; 컬럼 `memberships.product_id`.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0003_ops.sql — owner ops: product catalog, studio settings, exercise catalog.
-- RLS enabled (deny-by-default); service-role bypasses. Idempotent.

create table if not exists membership_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sessions int not null,
  price int not null,
  duration_days int not null default 90,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into membership_products (name, sessions, price, duration_days, sort_order)
select * from (values
  ('1:1 PT 10회권', 10, 750000, 90, 1),
  ('1:1 PT 20회권', 20, 1400000, 90, 2),
  ('1:1 PT 30회권', 30, 1980000, 90, 3)
) as v(name, sessions, price, duration_days, sort_order)
where not exists (select 1 from membership_products);

create table if not exists studio_settings (
  id int primary key default 1 check (id = 1),
  noshow_deducts boolean not null default true,
  cancel_cutoff_hours int not null default 0,
  notif_expiry boolean not null default true,
  notif_session boolean not null default true,
  notif_payment boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into studio_settings (id) values (1) on conflict (id) do nothing;

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into exercises (name, sort_order)
select * from (values
  ('스쿼트',1),('데드리프트',2),('벤치프레스',3),('레그프레스',4),
  ('랫풀다운',5),('숄더프레스',6),('런지',7),('플랭크',8)
) as v(name, sort_order)
where not exists (select 1 from exercises);

alter table memberships add column if not exists product_id uuid references membership_products(id);

alter table membership_products enable row level security;
alter table studio_settings enable row level security;
alter table exercises enable row level security;
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0003_ops.sql
git commit -m "feat(db): product catalog, studio settings, exercise catalog (0003)"
```

> 원격 DB 적용은 오케스트레이터가 실행 시 별도 확인 후 진행(Supabase MCP `apply_migration` 또는 deploy 경로). 코드 작성과 분리.

---

### Task 1.2: 타입 추가

**Files:**
- Modify: `src/lib/types.ts`

**Produces:** `MembershipProduct`(신규 형태), `StudioSettings`, `ExerciseItem`.

- [ ] **Step 1: 타입 정의 추가/교체**

기존 `MembershipProduct`(있다면 `{product,label,price,recommended}`)를 아래로 교체:

```ts
export type MembershipProduct = {
  id: string;
  name: string;
  sessions: number;
  price: number;
  durationDays: number;
  active: boolean;
  sortOrder: number;
};

export type StudioSettings = {
  noshowDeducts: boolean;
  cancelCutoffHours: number;
  notifExpiry: boolean;
  notifSession: boolean;
  notifPayment: boolean;
};

export type ExerciseItem = { id: string; name: string; active: boolean; sortOrder: number };
```

- [ ] **Step 2: 타입체크** — `bun run build` 또는 `bunx tsc --noEmit`. 깨진 참조는 다음 태스크에서 정리(예상됨).

---

### Task 1.3: 차감 정책 헬퍼 `shouldDeduct` (TDD)

**Files:**
- Create: `src/lib/data/deduction.ts`
- Test: `src/lib/data/deduction.test.ts`

**Produces:** `shouldDeduct(action, scheduledAtISO, settings, nowMs?) => boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/data/deduction.test.ts
import { test, expect } from "bun:test";
import { shouldDeduct } from "./deduction";
import type { StudioSettings } from "@/lib/types";

const S: StudioSettings = {
  noshowDeducts: true, cancelCutoffHours: 0,
  notifExpiry: true, notifSession: true, notifPayment: true,
};

test("attend always deducts", () => {
  expect(shouldDeduct("attend", "2026-06-25T10:00:00Z", S)).toBe(true);
});
test("noshow respects noshowDeducts", () => {
  expect(shouldDeduct("noshow", "2026-06-25T10:00:00Z", { ...S, noshowDeducts: true })).toBe(true);
  expect(shouldDeduct("noshow", "2026-06-25T10:00:00Z", { ...S, noshowDeducts: false })).toBe(false);
});
test("cancel never deducts when cutoff is 0", () => {
  expect(shouldDeduct("cancel", "2026-06-25T10:00:00Z", { ...S, cancelCutoffHours: 0 })).toBe(false);
});
test("cancel deducts only inside the cutoff window", () => {
  const now = new Date("2026-06-25T00:00:00Z").getTime(); // session 10h away
  const session = "2026-06-25T10:00:00Z";
  expect(shouldDeduct("cancel", session, { ...S, cancelCutoffHours: 24 }, now)).toBe(true);  // 10 < 24
  expect(shouldDeduct("cancel", session, { ...S, cancelCutoffHours: 6 }, now)).toBe(false);  // 10 < 6 → false
});
```

- [ ] **Step 2: 실패 확인** — `bun test src/lib/data/deduction.test.ts` → FAIL("shouldDeduct not exported").

- [ ] **Step 3: 구현**

```ts
// src/lib/data/deduction.ts
import type { AttendanceAction, StudioSettings } from "@/lib/types";

/** 차감 여부 정책. attend=항상, noshow=설정, cancel=수업까지 남은 시간이 기준시간 미만일 때만. */
export function shouldDeduct(
  action: AttendanceAction,
  scheduledAtISO: string,
  settings: StudioSettings,
  nowMs: number = Date.now(),
): boolean {
  if (action === "attend") return true;
  if (action === "noshow") return settings.noshowDeducts;
  if (settings.cancelCutoffHours <= 0) return false;
  const hoursUntil = (new Date(scheduledAtISO).getTime() - nowMs) / 3_600_000;
  return hoursUntil < settings.cancelCutoffHours;
}
```

- [ ] **Step 4: 통과 확인** — `bun test src/lib/data/deduction.test.ts` → PASS(4 tests).

- [ ] **Step 5: 커밋** — `git commit -m "feat(ops): shouldDeduct deduction-policy helper + tests"`

---

### Task 1.4: 상품·설정·종목 데이터 계층

**Files:**
- Modify: `src/lib/data/groups/owner-ops.ts` (getters)
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (actions)

**Consumes:** Task 1.2 타입.
**Produces (정확한 시그니처):**
```ts
// getters (owner-ops.ts)
getMembershipProducts(): Promise<MembershipProduct[]>   // active만, sort_order
getAllProducts(): Promise<MembershipProduct[]>          // 비활성 포함
getStudioSettings(): Promise<StudioSettings>            // 행 없으면 기본값
getExercises(): Promise<{ id: string; name: string }[]> // active만
getAllExercises(): Promise<ExerciseItem[]>
// actions (owner-ops-actions.ts) — 전부 ensureOwner
createProduct(i:{name:string;sessions:number;price:number;durationDays:number}): Promise<Result>
updateProduct(id:string, i:{name:string;sessions:number;price:number;durationDays:number}): Promise<Result>
setProductActive(id:string, active:boolean): Promise<Result>
updatePolicy(i:{noshowDeducts:boolean;cancelCutoffHours:number}): Promise<Result>
updateNotifications(i:{notifExpiry:boolean;notifSession:boolean;notifPayment:boolean}): Promise<Result>
createExercise(name:string): Promise<Result>
renameExercise(id:string,name:string): Promise<Result>
setExerciseActive(id:string,active:boolean): Promise<Result>
```

- [ ] **Step 1: getters 구현** — 기존 하드코딩 `getMembershipProducts()`(10/20/30 배열)를 테이블 조회로 교체. snake_case→camelCase 매핑. `getStudioSettings`는 `studio_settings` 단일행 select, 없으면 기본값 객체 반환.

- [ ] **Step 2: actions 구현** — 기존 owner-ops-actions.ts의 `ensureOwner`/role 체크 패턴(`createMember` 등) 그대로 사용. revalidatePath는 해당 설정/관리 경로.

- [ ] **Step 3: 타입체크** — `bunx tsc --noEmit`. (발급 UI는 Task 1.6에서 정리)

- [ ] **Step 4: 커밋** — `git commit -m "feat(ops): product/settings/exercise getters + owner actions"`

---

### Task 1.5: 차감 정책을 출석·요청수락에 적용

**Files:**
- Modify: `src/lib/data/groups/scheduling-actions.ts:35-73` (`confirmAttendance`), `:131-160` (`acceptRequest`)

**Consumes:** `shouldDeduct`(1.3), `getStudioSettings`(1.4).

- [ ] **Step 1: `confirmAttendance` 수정** — 세션 `scheduled_at` 조회 추가, `const deducted = action !== "cancel"` → `const settings = await getStudioSettings(); ... const deducted = shouldDeduct(action, session.scheduled_at, settings);`. attendance_ledger의 remaining_before/after 로직 유지.

- [ ] **Step 2: `acceptRequest` cancel 분기 수정** — 세션 cancelled 처리 시, `req.type==='cancel'`이면 세션 멤버들에 대해 `shouldDeduct('cancel', session.scheduled_at, settings)`로 차감 + attendance_ledger insert(action:'cancel', created_by:t.id). change 분기는 변경 없음.

- [ ] **Step 3: 빌드** — `bun run build` 성공.

- [ ] **Step 4: 커밋** — `git commit -m "feat(ops): apply deduction policy to attendance + accepted cancel requests"`

---

### Task 1.6: 회원·발급·결제 액션 확장 (+ 호출부 빌드 유지)

**Files:**
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`createMember`, `issueMembership`, `recordPayment`)
- Modify: `src/app/(app)/t/members/[id]/membership/ui.tsx` (issueMembership 시그니처 변경 대응 — 최소 컴파일 픽스)

**Produces:**
```ts
createMember(input:{
  name,phone,birth,gender,weekdays:number[],hour:number,
  trainerId?:string,
  product?:{productId:string},
  payment?:{method:PaymentMethod;amount?:number;paidAt?:string}
}): Promise<Result & {memberId?:string}>
issueMembership(memberId:string, productId:string): Promise<Result & {membershipId?:string}>
recordPayment(input:{memberId?;membershipId?;method:PaymentMethod;amount?:number;paidAt?:string}): Promise<Result>
```

- [ ] **Step 1: `issueMembership` 교체** — `product:"10"|"20"|"30"` → `productId:string`. 상품을 `membership_products`에서 조회, `end_date = start + duration_days`, `total/remaining = sessions`, `price`, `product_id` 기록, `product` 컬럼에는 표시용 회차 문자열(`String(sessions)`) 저장(레거시 라벨 호환).

- [ ] **Step 2: `recordPayment` 확장** — `amount`/`paidAt` 옵션 인자. 미지정 시 기존 동작(상품가/오늘).

- [ ] **Step 3: `createMember` 확장** — `member_trainers`에 `trainerId ?? t.id` 연결. 정기수업 생성 후, `product` 있으면 `issueMembership(member.id, product.productId)`, 이어서 `payment` 있으면 `recordPayment({membershipId, method, amount, paidAt})`. `{ ok:true, memberId: member.id }` 반환.

- [ ] **Step 4: 발급 UI 컴파일 픽스** — `membership/[id]/ui.tsx`에서 `issueMembership(id, selected)` 호출이 productId를 넘기도록 임시 수정(상품 `p.id` 사용). 완성 UI는 Agent A가 마감하므로 여기선 빌드만 통과시키면 됨.

- [ ] **Step 5: 빌드** — `bun run build` 성공.

- [ ] **Step 6: 커밋** — `git commit -m "feat(ops): integrated createMember(+trainer/product/payment), product-based issueMembership, editable recordPayment"`

---

### Task 1.7: 공용 컴포넌트 ConfirmDialog / Select / Combobox

**Files:**
- Create: `src/components/ui/ConfirmDialog.tsx`
- Create: `src/components/ui/Select.tsx` (Select + Combobox export)

**Produces:**
```ts
// ConfirmDialog: 제어형 오버레이
<ConfirmDialog open title description? confirmLabel cancelLabel? tone?("default"|"warn")
  onConfirm onCancel />
// Select: 단순 드롭다운
<Select value options:{value,label}[] onChange placeholder? />
// Combobox: 카탈로그 선택 + 자유 입력
<Combobox value options:string[] onChange placeholder? />
```

- [ ] **Step 1: 구현** — 기존 디자인 토큰/패턴 준수(`Card`, `Button`, light-only, `@theme` 색). ConfirmDialog는 fixed 오버레이 + 중앙 카드. Combobox는 input + 필터된 제안 목록(클릭=선택, 엔터/blur=자유값 확정). InstallPrompt.tsx의 오버레이 패턴 참고.

- [ ] **Step 2: 빌드** — `bun run build` 성공.

- [ ] **Step 3: 커밋** — `git commit -m "feat(ui): ConfirmDialog, Select, Combobox primitives"`

---

### Task 1.8: 설정 화면 라우팅 + 로그아웃 확인

**Files:**
- Modify: `src/app/(app)/t/settings/ui.tsx`

**Consumes:** ConfirmDialog(1.7). 신규 라우트(Phase 2): `/t/settings/products`, `/t/settings/exercises`, `/t/settings/policy`, `/t/settings/notifications`.

- [ ] **Step 1: rows 교체** — 깨진 `{ ...href:"/t/members/m_iji/membership" }`(회원권 발급) 제거. rows: 강사 관리(`/t/staff`) · 회원 등록(`/t/members/register`) · **회원권 상품**(`/t/settings/products`) · **운동 종목**(`/t/settings/exercises`) · **노쇼·취소 정책**(`/t/settings/policy`) · **알림 설정**(`/t/settings/notifications`). 전부 href(토스트 제거).

- [ ] **Step 2: 로그아웃 확인** — `onLogout`을 ConfirmDialog로 감싸기(`"로그아웃할까요?"`, tone warn).

- [ ] **Step 3: 빌드 + 커밋** — `bun run build` 성공. `git commit -m "feat(settings): real routes for ops menus, logout confirm, drop hardcoded id"`

> 이 시점 신규 라우트는 아직 페이지 없음(Phase 2에서 생성). 링크는 만들어두되 빌드는 통과(존재하지 않는 경로로의 `<Link>`는 빌드 에러 아님).

---

# Phase 2 — UI (병렬 3 에이전트, 파일 분리)

> 세 에이전트의 파일 집합은 교집합이 없다. 각자 Phase 1의 서버 계약을 호출만 한다.

## Agent A — 영업 동선

### Task A.1: 통합 회원 등록
**Files:** Modify `src/app/(app)/t/members/register/ui.tsx`, `src/app/(app)/t/members/register/page.tsx`
- [ ] page.tsx에서 `getMembershipProducts()` + active 강사 목록(`getStaff` 또는 기존 강사 getter) 로드해 ui로 전달.
- [ ] 폼에 섹션 추가: **담당 강사 `Select`**(기본 본인) · **회원권 상품 `RadioOption`/카드 목록 + "나중에"** · 상품 선택 시 **결제수단 `SegmentedToggle`(현금/카드/계좌) · 금액 `TextInput`(상품가 기본·수정) · 결제일 `TextInput type=date`(오늘 기본)**.
- [ ] 제출 → `createMember({...기존, trainerId, product?, payment?})`. 성공 시 `router.push('/t/members/'+memberId)`.
- [ ] 빌드 + 커밋.

### Task A.2: 회원 상세 발급 버튼
**Files:** Modify `src/app/(app)/t/members/[id]/page.tsx`
- [ ] 푸터에 `OutlineButton`/`PrimaryButton` "회원권 발급" → `href={'/t/members/'+id+'/membership'}` 추가(기존 메시지/기록/재등록 옆).
- [ ] 빌드 + 커밋.

### Task A.3: 발급 화면 상품 카탈로그화
**Files:** Modify `src/app/(app)/t/members/[id]/membership/ui.tsx`, `.../membership/page.tsx`
- [ ] page.tsx에서 `getMembershipProducts()` 전달. ui는 `p.id`로 선택, 라벨=`p.name`, 가격=`p.price`, 시작~종료를 `p.durationDays`로 표시. `issueMembership(id, selectedProductId)` → `/t/payment?...` 유지.
- [ ] 빌드 + 커밋.

### Task A.4: 결제 금액·날짜 입력 + 확인
**Files:** Modify `src/app/(app)/t/payment/ui.tsx`, `src/app/(app)/t/payment/page.tsx`
- [ ] 고정 span(:78 결제일, :83 금액)을 `TextInput`(amount 숫자, date `type=date`)으로. 상태 초기값=상품가/오늘. `recordPayment({...,amount,paidAt})` 전달.
- [ ] "결제 완료 기록"에 `ConfirmDialog`. 성공 후 `router.push('/t/members/'+memberId)`(맥락 복귀).
- [ ] 빌드 + 커밋.

### Task A.5: 상품 관리 화면 (신규)
**Files:** Create `src/app/(app)/t/settings/products/page.tsx`, `.../products/ui.tsx`
- [ ] page는 `requireOwnerPage()` + `getAllProducts()`. ui: 목록(이름·회차·가격·유효기간·활성) + 추가/수정 폼(`createProduct`/`updateProduct`) + 비활성 토글(`setProductActive`, `Switch`). 비활성=소프트 삭제.
- [ ] 빌드 + 커밋.

## Agent B — 운영 정책

### Task B.1: 노쇼·취소 정책 화면 (신규)
**Files:** Create `src/app/(app)/t/settings/policy/page.tsx`, `.../policy/ui.tsx`
- [ ] page: `requireOwnerPage()` + `getStudioSettings()`. ui: **노쇼 차감 `Switch`** · **취소 차감 기준시간 `TextInput`(숫자, "수업 N시간 전까지 취소는 차감 없음 · 0=항상 차감 없음")** → `updatePolicy`. 저장 시 토스트.
- [ ] 빌드 + 커밋.

### Task B.2: 알림 설정 화면 (신규)
**Files:** Create `src/app/(app)/t/settings/notifications/page.tsx`, `.../notifications/ui.tsx`
- [ ] page: `requireOwnerPage()` + `getStudioSettings()`. ui: 만료 임박/수업 리마인더/결제 알림 `Switch` 3개 → `updateNotifications`. 배너 "실제 발송 연동은 추후 제공".
- [ ] 빌드 + 커밋.

### Task B.3: 출석 처리 확인 + 복귀
**Files:** Modify `src/app/(app)/t/attend/[id]/ui.tsx`
- [ ] "출석 처리/취소 기록" 제출에 `ConfirmDialog`(차감 결과 문구 포함). 성공 후 `router.back()`(직전 화면 복귀, 기존 `/t` 대신).
- [ ] 빌드 + 커밋.

### Task B.4: 요청 수락·거절 확인
**Files:** Modify `src/app/(app)/t/inbox/ui.tsx` (또는 inbox 클라이언트)
- [ ] 수락/거절 버튼에 `ConfirmDialog`.
- [ ] 빌드 + 커밋.

### Task B.5: 재등록 일괄 발송 확인
**Files:** Modify `src/app/(app)/t/retention/ui.tsx`
- [ ] "안내 전 N명 일괄 발송"에 `ConfirmDialog`(N명에게 발송).
- [ ] 빌드 + 커밋.

## Agent C — 기록·검색

### Task C.1: 운동 기록 개선
**Files:** Modify `src/app/(app)/t/record/[id]/ui.tsx`, `src/app/(app)/t/record/[id]/page.tsx`
- [ ] page에서 `getExercises()` 전달. 각 종목 행의 이름을 **`Combobox`**(카탈로그 + 직접 입력)로. 행에 **삭제(X)** 버튼 추가(`setExercises(prev=>prev.filter)`). **코멘트** placeholder div → 실제 `<textarea>` 상태. `save`에서 `saveRecord(t.sessionId, exercises, comment)` 전달(액션은 이미 comment 지원).
- [ ] 빌드 + 커밋.

### Task C.2: 운동 종목 관리 화면 (신규)
**Files:** Create `src/app/(app)/t/settings/exercises/page.tsx`, `.../exercises/ui.tsx`
- [ ] page: `requireOwnerPage()` + `getAllExercises()`. ui: 목록 + 추가(`createExercise`) + 이름수정(`renameExercise`) + 비활성(`setExerciseActive`, `Switch`).
- [ ] 빌드 + 커밋.

### Task C.3: 회원 검색
**Files:** Modify `src/app/(app)/t/members/ui.tsx`
- [ ] placeholder `<span>`(:53-57)을 `TextInput`(controlled, `query` state)로. `items` 필터에 `&& (name/phone가 query 포함)` 추가(기존 필터칩과 AND). 회원 `sub`에 연락처가 없으면 view에 phone 포함 필요 시 page.tsx에서 전달(최소 변경).
- [ ] 빌드 + 커밋.

---

# Phase 3 — 검증 (독립 에이전트)

### Task 3.1: 통합 검증
- [ ] `bun run build` 성공, `bunx tsc --noEmit` 에러 0.
- [ ] `bun test` 전체 통과(특히 `deduction.test.ts`).
- [ ] 신규 라우트 존재 확인: `/t/settings/{products,exercises,policy,notifications}` 페이지 파일 + `requireOwnerPage`.
- [ ] 하드코딩 `m_iji` 잔존 0: `grep -rn m_iji src` → 없음.
- [ ] 검증 기준(스펙 §검증) 항목별 코드 경로 확인. 독립 증거로 보고(빌드 로그/grep 결과).

---

## Self-Review (작성자 체크 결과)

- **스펙 커버리지:** 8개 영역 ↔ 태스크 매핑 — 등록통합(A.1) · 검색(C.3) · 결제수정(A.4) · 차감정책(1.3/1.5+B.1) · 유효기간(1.1/1.6+A.3/A.5) · 종목·기록(1.4+C.1/C.2) · 확인다이얼로그·복귀(1.7+1.8/A.4/B.3-5) · 미구현메뉴(1.8+A.5/B.1/B.2/C.2). 누락 없음.
- **Placeholder:** 없음(모든 로직/계약 구체화; UI는 정확한 편집 지점·재사용 컴포넌트·검증 명시).
- **타입 일관성:** `MembershipProduct`(id/name/sessions/price/durationDays) · `StudioSettings`(noshowDeducts/cancelCutoffHours/notif*) · 액션 시그니처가 Phase 1↔Phase 2 호출부에서 동일.
- **빌드 그린 유지:** 시그니처 변경(issueMembership)의 호출부를 1.6 Step 4에서 같이 수정.
