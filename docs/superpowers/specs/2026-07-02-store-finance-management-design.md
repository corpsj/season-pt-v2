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
  category text not null check (category in ('labor','rent','utility','marketing','supply','etc')),
  amount int not null check (amount > 0),   -- 원(정수), payments.amount 관례
  spent_at date not null,                   -- 지출 발생일(KST 날짜 문자열)
  note text,
  trainer_id uuid references trainers(id) on delete set null,  -- 인건비 귀속(옵션)
  source text not null default 'manual' check (source in ('manual','settlement','incentive')),
  settle_month text,                        -- 'YYYY-MM' — 정산 출처 행의 대상 월
  recorded_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
-- 0001 불변식: 모든 테이블 RLS on(정책 없음=deny-by-default). 서버는 service-role 키로 접근.
alter table expenses enable row level security;

-- 확정 상태 조회·월별 지출 조회용. (멱등은 인덱스가 아니라 §5 액션의 delete-then-insert로 보장)
create index if not exists expenses_settle_idx on expenses (settle_month, source);
create index if not exists expenses_spent_at_idx on expenses (spent_at);
```

> **검토 반영:** 초안의 "부분 유니크 인덱스로 upsert 멱등"은 **오류**였다 — supabase-js/PostgREST는 `where source=...` 부분 인덱스를 `ON CONFLICT` 타깃으로 못 잡아 실패한다(코드베이스에 onConflict 선례 0건). 멱등은 §5 액션의 delete-then-insert로 옮긴다. 값 검증은 payments.method(enum) 관례에 맞춰 **DB CHECK**로 강제(앱 상수는 표시 라벨용).

**카테고리 라벨(앱 상수 — 저장값은 CHECK로 강제, 라벨만 매핑):**
`labor=인건비 · rent=임대료 · utility=공과금 · marketing=마케팅 · supply=소모품·장비 · etc=기타`

마이그레이션 적용: 기존 범용 스크립트 재사용 — `bun run scripts/apply-migration.ts supabase/migrations/0015_expenses.sql` (`new SQL(SUPABASE_DB_URL)`, psql 미설치).

---

## 5. 서버 레이어

**월 키 파생 규약(전 게터·액션 공통):** `off = Math.max(0, floor(monthOffset))`, `target = Date.UTC(nowKstY, nowKstM − off, 1)` (`nowKstParts()` 사용, `getSettlement`과 동일). `monthKey = 'YYYY-MM'`. `payments`/`expenses` 둘 다 date 컬럼이므로 월 필터는 **`col.slice(0,7) === monthKey`** 또는 `>= 'YYYY-MM-01' and < 익월-01` 문자열 경계로 한다(타임스탬프 경계 금지).

### `src/lib/data/groups/finance.ts` (server-only 게터, 스튜디오 전체 — `settlement.ts` 선례)
- **`getExpenses(monthOffset=0)`** → `{ monthOffset, monthLabel, items[], byCategory[], total }`
  월별 지출 목록 + 카테고리 소계. 각 item에 `source`·`trainerName?` 포함(정산 지급 배지용).
- **`getFinanceSummary(monthOffset=0)`** → 손익 한 장:
  ```
  { monthOffset, monthLabel, revenue, expenseTotal, netProfit,
    byCategory: [{ key, label, amount, pctOfRevenue }],
    netPrev, netDeltaPct }   // 전월 대비는 순이익 기준
  ```
  - `revenue` = 해당 월 `payments.amount` **전체 합**(환불 음수 포함 = 순매출, cash-basis). `/console/revenue` 히어로(`sel.total`)와 동일 기준.
  - `expenseTotal` = 해당 월 `expenses.amount` 합. `netProfit = revenue − expenseTotal`.
  - `netDeltaPct`: 전월 순이익>0일 때만(revenue 페이지 delta 규칙과 동일), 아니면 `null`.

### `src/lib/data/groups/settlement.ts` (기존 수정)
- **`getSettlement`에 `confirmed: boolean` 추가** — 해당 월 `expenses(source='settlement', settle_month=monthKey)` 행이 1개라도 있으면 `true`. (배지/토글의 유일한 상태 소스)

### `src/lib/data/groups/finance-actions.ts` (`"use server"`, 대표 전용)
모두 `getTrainerContext()` + `role==='owner'` 아니면 `OWNER_ONLY_ERROR`.
- **`addExpense({ category, amount, spentAt?, note?, trainerId? })`**
  `amount>0`·카테고리 검증. `spentAt` 미지정 시 **KST 오늘**(`kstDateISO(nowKstParts())`). `trainerId`는 `category==='labor'`일 때만 의미. `revalidatePath` → `/console/finance`, `/t/perf`.
- **`deleteExpense(id)`** — **`source='settlement'` 행은 거부**(정산 지급은 정산 페이지 확정/취소로만 관리 → 부분 삭제 desync 차단). `revalidatePath('/console/finance')`, `/t/perf`.
- **`confirmSettlement(monthOffset=0)`** — 핵심 연결. **delete-then-insert로 멱등**:
  1. `off`·`monthKey` 파생(위 규약).
  2. `getSettlement(monthOffset)` → 강사별 payout 계산.
  3. **그 달 `source='settlement'` 인건비 행 전체 삭제** → `payout>0` **AND `role!=='owner'`**(대표 정산 제외) 강사분을 새로 insert:
     `{ category:'labor', source:'settlement', trainer_id, settle_month:monthKey, amount:payout, spent_at:그 달 KST 말일(Date.UTC(y,m+1,0)), note:'YYYY-MM 정산', recorded_by:대표.id }`.
  4. 재클릭 = **새로고침**(늦은 출석 정정 반영), 항상 그 달 1강사 1행. 세션 `pay_rate` 스냅샷으로 과거 단가 변경은 소급 안 됨.
  5. `revalidatePath` → `/console/settlement`, `/console/finance`, `/t/perf`.
- **`unconfirmSettlement(monthOffset=0)`** — 그 달 `source='settlement'` 행 전체 삭제('확정 취소'). 동일 `revalidatePath`.

> **대표 정산 제외(확정):** `getSettlement`은 `role='owner'` 행도 payout을 내지만 `confirmSettlement`은 이를 인건비 지출로 **계상하지 않는다**(순이익 = 대표 몫 차감 前, net income excluding owner pay). 대표 수업료는 '남은 돈'에서 배분.
>
> **인센티브(후속):** 규칙 확정 전까지 대표가 인건비 지출을 **수동 한 줄**(`addExpense`, `source`는 `manual`로 저장하되 note="재등록 인센티브")로 추가. `source='incentive'` 자동 생성은 규칙 확정 시 승급. 수동 인센티브 행엔 멱등 가드 없음(중복 입력 대표 책임).

---

## 6. 화면 (PC 콘솔 중심 + 모바일 요약)

### 6.1 콘솔 사이드바 (`src/components/console/Sidebar.tsx`)
`강사 정산` 다음에 신규 NAV 항목: **`손익` → `/console/finance`**. `coins`/`tag`가 이미 매출·정산에 점유돼 있어 **`icon-data.ts`에 재무 아이콘 1개 신규 추가**(예: `chart`/`wallet`, `icon`·`activeIcon` 둘 다). NAV 항목은 `icon`+`activeIcon` 두 IconName 필요.

### 6.2 `/console/finance` (신규, `page.tsx` + `ui.tsx`)
기존 콘솔 패턴(`Topbar`, `Card`, `won`@`components/console/ui`, `Money`@`components/console/privacy`) 재사용. **월 네비 = `?m=` 오프셋**(`settlement` 방식, 게터 `monthOffset`과 일치 — revenue의 `?i=` 데이터인덱스 아님. 지출만 있고 매출 0인 달도 접근 가능해야 하므로 달력 오프셋이 맞다).

1. **손익 히어로** — `revenue` 히어로처럼 **순이익을 큰 sage 박스로 강조**, 매출·지출은 보조 숫자. 전월 대비 % 배지는 **순이익**에 부착(`netDeltaPct`, `null`이면 숨김). 순이익 음수 시 박스/숫자 terracotta.
2. **지출 구성** — 카테고리별 가로 막대 + 금액 + **매출 대비 %**. 경고 라벨 임계값: **임대료>20%, 인건비>60%**면 terracotta 라벨(그 외 회색). `%`는 `Money` 미적용(revenue 선례: 금액만 블러).
3. **지출 장부** — 해당 월 목록(카테고리 칩·날짜·메모·금액·삭제). 상단 **"지출 추가"** → **`ConsoleModal`**(결제 기록 패턴) 폼: 카테고리 `<select>`(6개), 금액, 날짜 `<input type=date>`, 메모; **`category==='labor'`일 때만** 강사 `<select>`(폼에 `getStaff()` 목록 전달, 선택 옵션) 노출. 삭제는 **확인 모달**.
   - `source='settlement'` 행은 **"정산 지급" 배지 + 삭제 버튼 숨김**(정산 페이지에서만 관리). 빈 상태: "이번 달 지출이 없어요".

### 6.3 `/console/settlement` (기존 수정)
- 상단 '이 달 지급 합계' pill 옆에 **`confirmed` 기반 토글 버튼**:
  - `confirmed=false` → **"지급 확정"**(`confirmSettlement(m)`), 클릭 시 확인 모달("이 달 정산을 지급 확정할까요? 인건비 지출로 반영돼요").
  - `confirmed=true` → **"지급 완료" 배지 + "확정 취소"**(`unconfirmSettlement(m)`, 확인 모달). 재확정은 "확정 취소" 후 다시 "지급 확정"(= 새로고침).
- 확정 시 인건비가 `/console/finance`에 반영됨을 하단 안내 문구에 추가. 확정 상태는 `getSettlement().confirmed`로 렌더.

### 6.4 모바일 `/t/perf` (운영 현황, 기존 수정)
- **2×2 지표 그리드 위에 전폭 "이번 달 순이익" 강조 스트립** 추가(`getFinanceSummary(0)` 재사용). 음수면 terracotta(값 색까지). `Money` 미적용 — perf는 `PrivacyProvider` 없이 기존 매출과 동일 노출 수준.
- 지출 입력·정산 확정은 **콘솔 전용**, 모바일은 표시만.

---

## 7. 엣지 케이스 · 검증

- **음수 순이익**(손해) → 정상 표시, terracotta.
- **데이터 없는 달** → 매출/지출 0, 순이익 0. 빈 상태 카피 노출(§6.2).
- **정산 재확정** → delete-then-insert라 재클릭해도 그 달 1강사 1행 + 최신값 반영. 과거 단가 변경은 세션 `pay_rate` 스냅샷으로 소급 안 됨.
- **부분 삭제 desync 방지** → 정산 지급 행은 `deleteExpense`가 거부, 확정/취소로만 일괄 관리.
- **회계 기준(의도적 혼합)** → 매출은 cash(결제 시점), 인건비는 확정 시점 계상(accrual성). 이 규모엔 무해 — 구현자가 임의로 '맞추지' 말 것.
- **프라이버시** → 콘솔 금액은 `Money` 블러(매출 페이지 일관), `%`는 미적용. 모바일 순이익은 노출(매출과 동일).
- **권한** → `/console/*`는 콘솔 레이아웃이 오너 게이팅(finance 페이지도 이에 의존; `getExpenses`/`getFinanceSummary`엔 내부 자체가드 없음). 액션은 `OWNER_ONLY_ERROR` 가드.

**검증(돈 경로 → 런너블 체크, `bun test`):**
- `getFinanceSummary`: `순이익 == 매출 − 지출`, 카테고리 소계 합 == 지출 총합.
- `confirmSettlement`: 2회 호출 → 강사당 인건비 1행(멱등); `role='owner'` 행 미계상; 단가 변경 후 재확정 → 최신 payout 반영.

---

## 8. 파일 변경 요약

**신규**
- `supabase/migrations/0015_expenses.sql`
- `src/lib/data/groups/finance.ts` (게터), `finance-actions.ts` (액션)
- `src/app/console/finance/page.tsx` + `ui.tsx`
- 테스트 1개 (`bun test`)
- *(마이그레이션 적용은 기존 `scripts/apply-migration.ts` 재사용 — 신규 스크립트 불필요)*

**수정**
- `src/components/console/Sidebar.tsx` (nav 추가) + `icon-data.ts` (재무 아이콘 1개)
- `src/lib/data/groups/settlement.ts` (`getSettlement`에 `confirmed`)
- `src/app/console/settlement/page.tsx` + `ui.tsx` (지급 확정/취소 토글)
- `src/app/(app)/t/perf/page.tsx` (순이익 강조 스트립)

---

## 9. 후속 (별도 스펙)
1. **인센티브 자동계산** — 재등록·신규영업 % 규칙 확정 후 `source='incentive'` 자동 생성.
2. 반복지출 템플릿(임대료 매월 자동/‘지난달 복사’).
3. 커스텀 카테고리, 지출 영수증 첨부(member-files 패턴 재사용).
4. 세무 보조(부가세·소득세·4대보험·3.3% 요약).

---

## 10. 부록 — 적대 검토(4렌즈)로 해결한 결정
초안 모호성 ~45%를 독립 검토로 실측 → 아래 결정으로 ~10%로 낮춤. **이 항목들은 확정 결정이니 계획 단계에서 재론 금지.**

| # | 초안 문제 | 확정 |
|---|---|---|
| 1 | 부분 유니크 인덱스로 upsert 멱등(=런타임 오류) | **delete-then-insert**로 멱등(§5), 인덱스는 조회용 비유니크 |
| 2 | "확정 후 고정" vs "upsert 갱신" 자기모순 | 재확정=**새로고침**(늦은 출석 반영), 단 과거 단가는 `pay_rate` 스냅샷으로 소급 안 됨 |
| 3 | 월 네비 `?m=`/`?i=` 교차참조 오류 | finance·settlement 모두 **`?m=` 오프셋**(게터 `monthOffset`과 일치) |
| 4 | "지급 완료" 상태 소스 없음 | `getSettlement().confirmed`(그 달 정산행 존재 여부) |
| 5 | 부분 삭제 desync | 정산행은 `deleteExpense` 거부, 확정/취소로만 일괄 |
| 6 | 대표 정산 인건비 계상 여부(사업 판단) | **제외**(net income excluding owner pay) — 사용자 확정 |
| — | RLS 누락 / 값 무제약 / KST 오늘 / revalidate 누락 / 마이그 스크립트 중복 / 아이콘 | RLS on·CHECK 제약·`kstDateISO`·관련 경로 전부 revalidate·기존 스크립트 재사용·아이콘 1개 추가 |

**남은 저위험 미결(계획/구현 재량):** 손익 히어로 세부 비주얼, 지출 구성 막대 스타일, 빈 상태 카피 문구 톤. 돈·상태 로직은 모두 확정.
