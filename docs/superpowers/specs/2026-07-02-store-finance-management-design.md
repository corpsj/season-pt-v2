# 매장 재무(손익) 관리 강화 — 설계

**작성일:** 2026-07-02
**브랜치:** membership-lifecycle
**한 줄:** 지금 앱은 *들어온 돈(매출)*만 보인다. *나간 돈(지출)*을 채워 **월 손익(순이익)**을 완성한다.

---

## 1. 배경 · 문제

현재 재무 기능은 반쪽이다.

| 구분 | 항목 | 상태 |
|---|---|---|
| 들어온 돈 | 매출(`payments`), 미수금 | ✅ 있음 (`/t/revenue`, `/console/revenue`) |
| 나간 돈 | 지출 전체 | ❌ 없음 |
| 나간 돈 | 강사 인건비 | ⚠️ *계산*만 있음(`getSettlement`), 지급 기록·비용 반영 없음 |
| 결과 | 순이익(매출−지출) | ❌ 없음 |

대표는 "이번 달 얼마 벌었나"는 보지만 **"실제로 얼마 남았나"**를 못 본다.
강사 정산은 금액이 뽑히지만 *'지급 완료'를 기록할 곳*이 없어 매번 실시간 재계산만 된다.

### 도메인 근거 (조사 결과)
소규모 피트니스 대표가 매달 보는 도구는 **월별 손익계산서(P&L)** 한 장이다. 지출은 실무상 두 덩어리:
- **인건비(강사 급여)** — PT샵 지출 1위, 보통 매출의 30~60%.
- **고정·운영비** — 임대료(매출 10~20% 이하 권장), 공과금, 마케팅, 소모품·장비, 기타.

핵심 지표 = 각 비용의 매출 대비 % + 전월 대비 증감.

### 이 스튜디오의 강사 급여 구조
- **기본: 회당제** — 진행 수업 1회당 단가 (현재 앱의 `getSettlement`과 일치).
- **추가: 정률 인센티브** — 담당 회원 *재등록*, *신규회원 영업* 시 % 지급. **세부 규칙은 후속 확정.**

---

## 2. 목표 · 비목표

**목표(v1)**
1. 지출을 6개 분류로 입력·조회하는 장부.
2. 기존 강사 정산을 **'지급 확정'** → 인건비 지출로 자동 반영(멱등).
3. 월 손익 요약: `매출 − 지출 = 순이익`, 항목별 매출 대비 %, 전월 대비.

**비목표(후속)** — 처음 하는 대표에게 과함(YAGNI):
- 인센티브 **자동계산** (규칙 미확정 → v1은 인건비 수동 한 줄로 입력, `source='incentive'` 자리만 마련).
- 반복지출 자동생성(임대료 매월), 커스텀 카테고리.
- 부가세·종합소득세·4대보험·3.3% 원천징수 계산/신고.
- 손익분기 계산기, 현금흐름 예측, 지출 영수증 첨부.

---

## 3. 설계 방식 결정

- **A. `payments`에 지출을 음수로** → ❌ `payments`는 곧 매출이고 `getStudioOps`가 전 payments 합을 매출로 집계 → 오염. (별도 테이블이 필요한 이유)
- **B. 별도 `expenses` 테이블 + 정산→지출 연결 + 손익은 조합** → ✅ **채택.** 매출/지출 완전 분리, 기존 코드 무손상.
- **C. 정식 복식부기(계정과목·거래원장)** → ❌ 과함. 세무는 세무사 몫.

---

## 4. 데이터 모델

### 새 마이그레이션 `supabase/migrations/0015_expenses.sql`
```sql
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,      -- 'labor'|'rent'|'utility'|'marketing'|'supply'|'etc'
  amount int not null,         -- 원, 양수(지출액)
  spent_at date not null,      -- 지출 발생일(KST 날짜 문자열)
  note text,
  trainer_id uuid references trainers(id) on delete set null,  -- 인건비 귀속(옵션)
  source text not null default 'manual',   -- 'manual'|'settlement'|'incentive'
  settle_month text,           -- 'YYYY-MM' — 정산 지급 확정 멱등키
  recorded_by uuid references trainers(id),
  created_at timestamptz not null default now()
);

-- 정산 지급 이중기록 방지: (강사, 월) 유니크 (정산 출처 행 한정)
create unique index if not exists expenses_settlement_uniq
  on expenses (trainer_id, settle_month) where source = 'settlement';

create index if not exists expenses_spent_at_idx on expenses (spent_at);
```

**카테고리(앱 상수, 별도 테이블 없음 — `METHOD_LABEL` 패턴):**
`labor=인건비 · rent=임대료 · utility=공과금 · marketing=마케팅 · supply=소모품·장비 · etc=기타`

마이그레이션 적용: `new SQL(SUPABASE_DB_URL)` Bun 스크립트 (psql 미설치, 기존 관례).

---

## 5. 서버 레이어

### `src/lib/data/groups/finance.ts` (server-only 게터, 스튜디오 전체)
- **`getExpenses(monthOffset=0)`** → `{ monthLabel, items[], byCategory[], total }`
  월별 지출 목록 + 카테고리 소계. (매출 `getRevenue` 월 그룹핑 패턴 재사용)
- **`getFinanceSummary(monthOffset=0)`** → 손익 한 장:
  ```
  { monthLabel, revenue, expenseTotal, netProfit,
    byCategory: [{ key, label, amount, pctOfRevenue }],
    revenuePrev, netPrev, netDeltaPct }
  ```
  - `revenue` = 해당 월 `payments.amount` **전체 합**(환불 음수 포함 = 순매출). `/console/revenue` 히어로(`sel.total`)와 동일 기준.
  - `expenseTotal` = 해당 월 `expenses.amount` 합.
  - `netProfit = revenue − expenseTotal`.

### `src/lib/data/groups/finance-actions.ts` (`"use server"`, 대표 전용)
모두 `getTrainerContext()` + `role==='owner'` 아니면 `OWNER_ONLY_ERROR`.
- **`addExpense({ category, amount, spentAt?, note?, trainerId? })`**
  `amount>0` 검증, `spentAt` 미지정 시 오늘. `revalidatePath('/console/finance')`.
- **`deleteExpense(id)`** — 지출 삭제. (정산 출처 행 삭제 = 해당 월 '확정 취소'.)
- **`confirmSettlement(monthOffset=0)`** — 핵심 연결:
  1. `getSettlement(monthOffset)`로 강사별 지급액 계산.
  2. `payout>0` 강사마다 `expenses`에 인건비 행 upsert:
     `{ category:'labor', source:'settlement', trainer_id, settle_month:'YYYY-MM', amount:payout, spent_at:월말일, note:'2026-06 정산' }`.
  3. 유니크 인덱스로 **멱등**(재실행해도 1행). 확정 후 정산 단가가 바뀌어도 `expenses.amount`는 고정(이미 세션 `pay_rate` 스냅샷 존재).

> **인센티브(후속):** 규칙 확정 전까지 대표가 인건비 지출을 **수동 한 줄**(`source='incentive'`, `trainer_id`, note="재등록 인센티브")로 추가. 규칙 확정 시 이 행을 자동 생성하도록 승급.

---

## 6. 화면 (PC 콘솔 중심 + 모바일 요약)

### 6.1 콘솔 사이드바 (`src/components/console/Sidebar.tsx`)
`강사 정산` 다음에 신규 항목 추가: **`손익` → `/console/finance`** (icon: `coins-fill`/유사).

### 6.2 `/console/finance` (신규, `page.tsx` + `ui.tsx`)
기존 콘솔 패턴(`Topbar`, `Card`, `won`, `Money` 프라이버시 블러) 재사용. 월 네비게이션(revenue 페이지와 동일 `?m=` 방식).

1. **손익 히어로** — 큰 숫자 3개: 매출 / 지출 / **순이익**(음수면 terracotta 경고색) + 전월 대비 %.
2. **지출 구성** — 카테고리별 막대 + 금액 + **매출 대비 %** (임대료>20% 등 벤치마크 경고 라벨).
3. **지출 장부** — 해당 월 지출 목록(카테고리 칩·날짜·메모·금액, 삭제). 상단 **"지출 추가"** 버튼 → 폼(카테고리 선택·금액·날짜·메모, 인건비 선택 시 강사 지정 옵션).
   - 정산 출처(`source='settlement'`) 행은 "정산 지급"으로 배지 표시, 개별 삭제 대신 정산 페이지에서 관리 유도.

### 6.3 `/console/settlement` (기존 수정)
- 월별 **"지급 확정"** 버튼 추가(`confirmSettlement(monthOffset)`).
- 확정된 달은 **"지급 완료"** 배지 + 버튼이 "확정 취소"로 토글(해당 월 `source='settlement'` 행 삭제).
- 확정 시 그 달 인건비가 `/console/finance`에 자동 반영됨을 안내 문구로.

### 6.4 모바일 `/t/perf` (운영 현황, 기존 수정)
- 상단 지표에 **"이번 달 순이익"** 한 줄/타일 추가 (`getFinanceSummary(0)` 재사용).
  - 2×2 그리드 위에 강조 스트립으로 배치하거나 타일 추가(구현 시 레이아웃 확정).
- 지출 입력은 콘솔 전용 — 모바일은 **표시만**.

---

## 7. 엣지 케이스 · 검증

- **음수 순이익**(손해) → 정상 표시, 경고색.
- **데이터 없는 달** → 매출/지출 0, 순이익 0.
- **정산 재확정** → 유니크 인덱스로 이중 인건비 방지. 단가 변경은 확정된 과거 달에 소급 안 됨.
- **프라이버시** → 콘솔 금액은 `Money` 블러 컴포넌트 사용(매출 페이지와 일관).
- **권한** → 게터는 콘솔(=`requireOwnerPage`) 뒤에서만 도달, 액션은 `OWNER_ONLY_ERROR` 가드.

**검증(돈 경로 → 런너블 체크 1개, `bun test`):**
- `getFinanceSummary`: `순이익 == 매출 − 지출`, 카테고리 소계 합 == 지출 총합.
- `confirmSettlement`: 2회 호출 → 강사당 인건비 1행(멱등).

---

## 8. 파일 변경 요약

**신규**
- `supabase/migrations/0015_expenses.sql`
- `src/lib/data/groups/finance.ts` (게터)
- `src/lib/data/groups/finance-actions.ts` (액션)
- `src/app/console/finance/page.tsx` + `ui.tsx`
- 마이그레이션 적용 스크립트(기존 Bun.SQL 관례)
- 테스트 1개

**수정**
- `src/components/console/Sidebar.tsx` (nav 추가)
- `src/app/console/settlement/page.tsx` + `ui.tsx` (지급 확정)
- `src/app/(app)/t/perf/page.tsx` (순이익 요약 타일)

---

## 9. 후속 (별도 스펙)
1. **인센티브 자동계산** — 재등록·신규영업 % 규칙 확정 후 `source='incentive'` 자동 생성.
2. 반복지출 템플릿(임대료 매월 자동/‘지난달 복사’).
3. 커스텀 카테고리, 지출 영수증 첨부(member-files 패턴 재사용).
4. 세무 보조(부가세·소득세·4대보험·3.3% 요약).
