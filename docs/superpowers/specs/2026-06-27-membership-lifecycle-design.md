# 회원권 라이프사이클 — 발급·결제·차감·연장·환불·양도·알림

작성일: 2026-06-27
대상: 회원권/결제(`memberships`, `payments`), 출석 차감(`attendance_ledger`), 신규 등록 흐름, 알림(신규)
권한 범위: 발급·결제·연장·환불·양도는 **대표 전용**

## 배경 / 문제

대표 인터뷰로 회원권 운영 규칙이 확정됐는데, 현재 코드와 여러 곳에서 충돌하거나 아예 비어 있다.

- **상품 불일치**: 코드는 `10/20/30회권`(75/140/198만원, `owner-ops-actions.ts:23`, `owner-ops.ts:227`, `seed.ts:201`, `types.ts:67/473`, `membership/ui.tsx:27`)인데 대표 상품은 **8/16/24회**.
- **유효기간 고정**: `issueMembership`이 전 상품 **+90일 고정**(`owner-ops-actions.ts:98`). 규칙은 **8회 30일 / 16회 60일 / 24회 90일**.
- **취소 차감 없음**: `confirmAttendance`의 cancel은 **무조건 차감 안 함**(`scheduling-actions.ts:47`). 규칙은 **12시간 기준**.
- **없는 기능**: 만료 후 연장, 분할·혼합결제(현재 회원권당 1건·전액만, `recordPayment`), 중도 환불, 양도, 잔여 임박 알림(알림 **백킹 테이블 없음** — 설정 토글만 쿠키 저장, `member.ts:610`), "회원=결제완료" 정의(현재 등록·결제 분리).

이미 맞는 것은 둔다: **노쇼 차감**(`confirmAttendance` noshow는 이미 차감), **발급·결제 대표 가드**(`guard.ts`).

## 목표

1. 상품 카탈로그를 8/16/24회 + 회차별 유효기간으로 교체하고, 흩어진 정의를 한 곳으로 통합.
2. 신규 등록 = 회원정보 + 회원권 + 첫 결제(분할 가능)를 한 흐름으로. "결제 없이 회원 없음."
3. 분할·혼합결제 + 미수금 추적.
4. 취소·변경 12시간 차감 규칙(안내·기본값, 선생님 수동 최종 결정).
5. 대표 액션: 연장 / 환불 / 양도 + 감사 이력.
6. 잔여 3회·만료 임박 알림을 인앱 우선·문자/카톡 확장 가능한 저장형으로 신규 구축.

### 비목표 (YAGNI)

- **일시정지**: 범위 외. 대표는 일시정지 대신 연장으로 처리(인터뷰 Q10 → 연장으로 대체).
- **문자/카톡 실제 발송**: 본 설계는 `notifications` 행 생성·인앱 노출까지. sms/kakao sender는 `channel` 컬럼을 seam으로 두고 추후.
- **상품 가격 관리 UI**: 가격은 코드 상수(`products.ts`)로 관리. 대표 셀프 편집 필요해지면 그때 테이블 승격.
- **부분 양도**: 회원권 통째 이전만. 잔여 회차 일부 분할 양도는 안 함.
- **양도 시 수업 스케줄 자동 이동**: 회원권만 이전. 스케줄(정기 수업)은 별개로 둔다.
- **웹푸시 구축**: 현재 SW는 network-only(알림용 아님). 푸시는 범위 밖.

## 인터뷰 확정 규칙

| # | 영역 | 결정 |
|---|---|---|
| 1 | 상품 | 8/16/24회, 유효기간 30/60/90일, 10/20/30 완전 교체, 세 상품이 전부 |
| 2 | 가격 | 대표/강사 이중 단가 + 1회 정상가(환불용), 금액 TBD(대표 확인) |
| 3 | 등록 | 정보+회원권+첫결제 통합, 첫 결제(분할 포함)부터 회원 |
| 4 | 결제 | 분할·혼합(여러 결제줄), 미수금 = 가격 − 결제합계 |
| 5 | 차감 | 취소·변경 12시간은 안내·기본값, 회원 사정만, 선생님 수동 토글. 노쇼 차감 |
| 6 | 연장 | 대표 버튼 → +상품기간(30/60/90), 무료, 잔여>0일 때만 |
| 7 | 환불 | 결제합계 − 사용회차×1회정상가 − 결제합계×10%, 음수 결제로 기록, '환불' 종료 |
| 8 | 양도 | 회원권 통째 이전, 기존/신규 둘 다 |
| 9 | 알림 | 잔여 3회 + 만료 임박, 회원+선생님, 인앱 우선 + 확장형 저장 |
| 10 | 권한 | 발급·결제·연장·환불·양도 전부 대표 전용 |

## 구현 전략

**재사용 우선 + 최소 신규.** 신규 테이블은 `notifications`, `membership_events` 2개뿐. 분할/환불은 기존 `payments`(여러 행 / 음수 행)로, 차감은 기존 `attendance_ledger`로 흡수.

## 1. 데이터 모델 (마이그레이션 `0003_membership_lifecycle.sql`)

```sql
-- 환불 종료 상태 추가 (active=사용가능, expired=만료(연장 대상), refunded=환불 종료)
alter type membership_status add value if not exists 'refunded';

-- 발급 시점 1회 정상가(비할인) 스냅샷 — 환불 차감식 고정용
alter table memberships add column if not exists list_unit_price int;

-- 회원권 이력(연장·양도·환불 등 payments에 안 남는 동작의 감사 로그)
create table if not exists membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  type text not null check (type in ('issue','extend','refund','transfer')),
  amount int,                       -- 연장: 일수 / 환불: 음수 환불액 / 그 외 null
  note text,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_membership_events_ms on membership_events(membership_id);

-- 알림(인앱 우선, channel이 확장 seam)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type actor_type not null,         -- 'member' | 'trainer'
  recipient_id uuid not null,
  type text not null check (type in ('low_sessions','expiring')),
  title text not null,
  body text,
  membership_id uuid references memberships(id) on delete cascade,
  channel text not null default 'in_app',     -- 'in_app' | 'sms' | 'kakao'(추후)
  status text not null default 'unread',       -- in_app: unread|read / 외부: pending|sent
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_recipient on notifications(recipient_type, recipient_id, status);
-- RLS: 다른 테이블과 동일하게 enable(서버 service-role 경유). 0001 패턴 따름.
```

- `payments`: **변경 없음**. 분할/혼합 = 여러 행, 환불 = 음수 `amount` 행. (0002에서 `membership_id` nullable + `note` 이미 확보)
- `attendance_ledger`: **변경 없음**. `deducted`/`remaining_before/after` 그대로.
- 새 테이블 `type`/`channel`/`status`는 **text+check**(enum 대신) — 확장(sms/kakao)이 목표라 마이그레이션 마찰 줄임. *의도적 단순화.*

## 2. 상품·가격 설정 → `src/lib/data/products.ts` (신규 상수, 단일 출처)

```ts
export type ProductKey = "8" | "16" | "24";
export type Tier = "owner" | "instructor";

export const PRODUCTS: Record<ProductKey, {
  sessions: number; days: number;
  price: Record<Tier, number>;       // 회원권 판매가(tier별)
  unitList: Record<Tier, number>;    // 1회 정상가(비할인, 환불 차감용)
}> = {
  "8":  { sessions: 8,  days: 30, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
  "16": { sessions: 16, days: 60, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
  "24": { sessions: 24, days: 90, price: { owner: 0, instructor: 0 }, unitList: { owner: 0, instructor: 0 } },
};
// 0 = TBD. 대표 확인 후 12개 숫자 입력. (§9)
```

- 교체 대상: `owner-ops-actions.ts`(PRODUCT_PRICE, issueMembership 시그니처/+90일), `owner-ops.ts:227`, `seed.ts:201`, `types.ts`(`"10"|"20"|"30"` → `ProductKey`), `membership/ui.tsx:27`.
- **tier 결정**: 발급 시 회원의 담당 강사 role(`member_trainers`→`trainers.role`). owner→`owner` 단가, instructor→`instructor` 단가. 가격은 화면에서 수정 가능.
- 발급 시 `memberships.price`(실제 청구가) + `list_unit_price`(해당 tier `unitList` 스냅샷) 저장.
- 유효기간 = `start_date + PRODUCTS[product].days`(회차별).

## 3. 신규 등록 통합 + 미수금

- `createMember` + `issueMembership` + `recordPayment`를 **한 등록 흐름**으로 통합(통합 server action `registerMember`). 단계: 정보 → 상품/가격(tier 기본값) → 첫 결제줄(분할·혼합 입력). 결제 1줄 이상 없으면 회원 생성 안 함.
- **미수금 = `memberships.price` − Σ `payments.amount`(해당 membership, 양수)** — 계산값, 컬럼 추가 X.
- 회원 상세/결제 화면: `가격 / 결제 / 미수` 표시, 미수 0 = 완납. 분할 2회차 = 같은 회원권에 payments 행 추가(기존 `recordPayment` 확장 또는 재사용).
- 첫 결제(분할 일부 포함)부터 회원으로 카운트.

## 4. 차감 — 12시간 규칙 (안내·기본값, 선생님 수동)

- `confirmAttendance(sessionId, action, deduct: boolean)` — `deduct` 파라미터 추가.
- 기본값(휴리스틱, 선생님이 토글로 덮어씀):
  - `attend` → 항상 차감.
  - `noshow` → 기본 차감 ON.
  - `cancel` → 회원 사정 & 예정시각까지 < 12h 면 ON, 선생님 사정 or ≥ 12h 면 OFF.
- UI: "예정까지 OO시간 · 정책상 차감 대상/아님" 안내 문구 + 차감 토글. 시간 정밀 강제는 안 함(수동이라 코드 단순).
- 회원 요청 취소 수락 경로(`acceptRequest`의 cancel, `scheduling-actions.ts:147`)도 동일 차감 판단을 거치게 정렬(현재 무조건 차감 없음 → 토글 경유).
- `attendance_ledger`에 `deducted`/`remaining_*` 그대로 기록(감사).

## 5. 대표 액션 — 연장 / 환불 / 양도

모두 owner 가드(`ensureOwner`). 새 server action은 `src/lib/data/groups/membership-actions.ts`(신규)에 모음.

### 연장 `extendMembership(membershipId)`
- `end_date += PRODUCTS[product].days`(회차별). 무료.
- 직전 상태가 `expired`였으면 `active`로 복귀.
- `membership_events(type='extend', amount=days)`.
- 버튼 노출: 잔여 회차 > 0 일 때(만료·임박 회원 상세).

### 환불 `refundMembership(membershipId, method)`
```
paidSum   = Σ payments.amount (membership, amount>0)
used      = total_sessions − remaining_sessions
deduction = used × list_unit_price          // 1회 정상가(비할인)
penalty   = round(paidSum × 0.10)           // 위약금 10%
refund    = max(0, paidSum − deduction − penalty)
```
- 기록: `payments`에 **음수 행**(`amount = −refund`, `note='환불: 사용 {used}회 정상가 차감 / 위약금 10%'`, `recorded_by`) → 매출 자동 차감(매출 합계가 음수 행 포함, 메모리 규칙과 일관).
- `memberships`: `status='refunded'`, `remaining_sessions=0`.
- `membership_events(type='refund', amount=−refund, note=내역)`.
- UI: 확정 전 **계산 내역 미리보기**(paidSum/deduction/penalty/refund). `refund=0`이면 음수 결제 행 생략, 상태만 환불.

### 양도 `transferMembership(membershipId, target)`
- `target` = 기존 회원 선택 **또는** 신규 회원 즉시 등록(이 경로는 **새 결제 없음** — 양도는 신규 결제가 아님).
- `memberships.member_id` 교체(통째 이전). `payments`/미수금은 회원권에 붙어 함께 이동.
- 신규 대상은 담당 강사 지정(기본 = 원 회원의 담당). 수업 스케줄 자동 이동 없음.
- `membership_events(type='transfer', note='{원회원} → {대상}')`.
- 엣지: 미수금이 남은 회원권 양도 시 미수금도 따라감(대표가 양도 전 정산 가정). UI에 미수금 경고.

## 6. 알림 모델

- **생성 트리거**:
  - `low_sessions`: `confirmAttendance` 차감 직후 `remaining_after ≤ 3`이고 임계 진입 시 → 회원 + 담당 선생님 알림.
  - `expiring`: active 회원권 중 `end_date ≤ today + N일`(기본 N=7) 스캔 → 회원 + 담당 선생님. (실행: pg_cron 일 1회 권장, 또는 트레이너 홈 getter에서 일자 가드로 throttle — 구현 단계에서 선택.)
- **중복 방지**: 같은 `membership_id` + `type`의 `unread`가 있으면 재생성 안 함. *임계치 재진입 시 한 건만 — 회차별 알림 필요하면 고도화.*
- **노출**: 회원 홈/알림 피드(신규 또는 `m/my/notifications` 확장), 선생님 홈 "관리 필요"(기존 expiring 신호 `trainer-home.ts:145` 확장). 회원 알림 **설정 토글**(쿠키, `member.ts:618`) 존중 — off면 인앱 표시 억제.
- **확장**: 문자/카톡은 `channel='sms'|'kakao'` + `status='pending'` 행을 읽는 sender만 추후 추가. 본 설계는 행 생성·인앱 표시까지.

## 7. 권한

- `registerMember`·결제·`extendMembership`·`refundMembership`·`transferMembership` = `guard.ts`의 `ensureOwner()`/role 체크(기존 패턴). 데이터 getter는 가드 페이지 경유라 무가드 유지.

## 8. 구현 단계 (단계별 출시)

1. **기반**: `products.ts` 교체 + 마이그레이션 `0003` + 통합 등록(`registerMember`) + 미수금 표시.
2. **차감**: `confirmAttendance`/`acceptRequest` 12시간 토글.
3. **라이프사이클**: `membership-actions.ts`(연장·환불·양도) + `membership_events` + 회원 상세 타임라인/버튼.
4. **알림**: `notifications` 테이블 + 생성(차감 hook, 만료 스캔) + 회원/선생님 노출.

## 9. 대표 확인 필요 (TBD — 차단 아님, 빈칸만 채움)

- `products.ts` 12개 숫자: 8/16/24 **판매가**(owner/instructor) + **1회 정상가**(owner/instructor).
- 만료 임박 알림 기준일 N(기본 7일 제안).

## 파일 영향 범위

| 동작 | 파일 |
|---|---|
| 상품 상수 | `src/lib/data/products.ts`(신규), `types.ts`, `seed.ts:201`, `owner-ops.ts:227` |
| 발급/등록/결제 | `owner-ops-actions.ts`(createMember/issueMembership/recordPayment 통합), `t/members/[id]/membership/ui.tsx` |
| 차감 | `scheduling-actions.ts`(confirmAttendance/acceptRequest), `t/attend/[id]` |
| 라이프사이클 | `src/lib/data/groups/membership-actions.ts`(신규), 회원 상세 UI |
| 알림 | 마이그레이션, `notifications` getter/generator(신규), `member.ts`/`trainer-home.ts`, 회원·선생님 홈 UI |
| 마이그레이션 | `supabase/migrations/0003_membership_lifecycle.sql`(신규) |
| 가드 | `src/lib/auth/guard.ts`(기존 패턴 재사용) |
