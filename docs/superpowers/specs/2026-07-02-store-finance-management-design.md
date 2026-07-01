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
-- 인덱스명은 코드베이스 관례 `idx_<table>_<cols>` 접두(전량 13개 idx_ 접두, _idx 접미 0개).
create index if not exists idx_expenses_settle on expenses (settle_month, source);
create index if not exists idx_expenses_spent_at on expenses (spent_at);
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
  `amount>0`·카테고리 검증. `spentAt` 미지정 시 **KST 오늘 = `todayISO()`** (db.ts의 `kstDateISO(new Date())`. ⚠️ `kstDateISO(nowKstParts())`는 +9h 이중 시프트 버그 — `nowKstParts()`가 이미 +9h). `trainerId`는 `category==='labor'`일 때만 저장(그 외 null). `revalidatePath` → `/console/finance`, `/t/perf`.
- **`deleteExpense(id)`** — **`source='settlement'` 행은 거부**(정산 지급은 정산 페이지 확정/취소로만 관리 → 부분 삭제 desync 차단). `revalidatePath('/console/finance')`, `/t/perf`.
- **`confirmSettlement(monthOffset=0)`** — 핵심 연결. **delete-then-insert로 멱등**:
  1. `off`·`monthKey` 파생(위 규약).
  2. `getSettlement(monthOffset)` → 강사별 payout 계산.
  3. **그 달 `source='settlement'` 인건비 행 전체 삭제** → `payout>0` **AND `role!=='owner'`**(대표 정산 제외) 강사분을 새로 insert:
     `{ category:'labor', source:'settlement', trainer_id, settle_month:monthKey, amount:payout, spent_at:그 달 KST 말일, note:'YYYY-MM 정산', recorded_by:대표.id }`.
     말일 = §11.4 `monthKeys(off).lastDay`(대상 월 기준 `m+1−off`, **`-off` 필수** — 지난 달 확정 시 이번 달 말일이 찍히면 안 됨).
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

**남은 저위험 미결(계획/구현 재량):** 손익 히어로 세부 비주얼, 지출 구성 막대 스타일, 빈 상태 카피 문구 톤. 돈·상태 로직은 모두 확정. → **아래 §11에서 이 잔여까지 전부 확정.**

---

## 11. 부록 B — 무추측 구현 명세 (7슬라이스 코드 대조로 확정)
2차 검토가 슬라이스별로 남은 결정을 **코드 근거로 전부 해소**. 아래는 구현자가 추측할 것이 없는 확정값. **검토가 추가로 잡은 버그: `kstDateISO(nowKstParts())`는 +9h 이중 시프트 → `todayISO()` 사용**(본문 §5 반영).

### 11.1 마이그레이션 `0015_expenses.sql` (최종)
- 상단 한국어 헤더 2줄(0013/0014식). `create table if not exists`(멱등). 컬럼 순서 = 본문 §4.
- **인덱스명 교정:** `idx_expenses_settle (settle_month, source)`, `idx_expenses_spent_at (spent_at)` (관례 `idx_` 접두).
- `alter table expenses enable row level security;` (직접 alter 1줄, 정책 없음=deny-by-default, 주석 `-- service-role만`. 0003/0006/0009 관례). `create extension` 재선언 금지(pgcrypto 0001에 영속).
- FK: `trainer_id … on delete set null`(이력 보존), `recorded_by references trainers(id)`(절 없음=NO ACTION, payments.recorded_by 동일). CHECK 3개 인라인(category/amount>0/source). `spent_at`·`settle_month` DEFAULT 없음.

### 11.2 `src/lib/data/finance-calc.ts` (신규 **순수** 모듈 — server-only 금지, DB 금지 → 테스트 대상)
> ⚠️ `groups/finance.ts`는 `import "server-only"`라 `bun:test` 불가(kst-bounds.ts 선례처럼 순수 계산은 별도 파일). 게터/액션이 이 모듈을 import해 조합.
- `export const CATEGORY_LABELS = { labor:'인건비', rent:'임대료', utility:'공과금', marketing:'마케팅', supply:'소모품·장비', etc:'기타' } as const;` + `export type ExpenseCategory = keyof typeof CATEGORY_LABELS;` + `export type ExpenseSource = 'manual'|'settlement'|'incentive';`
- `summarizeFinance({ revenue, expenses:{category,amount}[], prevNet }) → { revenue, expenseTotal, netProfit, byCategory:{key,label,amount,pctOfRevenue:number|null}[], netDeltaPct:number|null }`. `expenseTotal=Σamount`, `netProfit=revenue−expenseTotal`(음수 허용), `pctOfRevenue = revenue>0 ? round(amount/revenue*100) : null`, `netDeltaPct = prevNet>0 ? round((netProfit−prevNet)/prevNet*100) : null`. **byCategory = `amount>0`만, `amount` 내림차순**(§11.7 막대·revenue 결제수단과 동일 정렬 — UI 재정렬 불필요).
- `settlementLaborRows(rows: LaborInput[], { monthKey, spentAt, recordedBy }) → insertRow[]`. **`LaborInput = { trainerId:string; role:string; payout:number }`를 finance-calc.ts에 로컬 정의**(settlement.ts의 `SettlementRow`를 **import 하지 않는다** — server-only 모듈이라 `bun:test`에서 로드되면 throw; SettlementRow가 이 구조를 구조적으로 만족하므로 호출부는 그대로 전달). `rows.filter(r=>r.payout>0 && r.role!=='owner')` → `{category:'labor', source:'settlement', trainer_id:r.trainerId, settle_month:monthKey, amount:r.payout, spent_at:spentAt, note:`${monthKey} 정산`, recorded_by:recordedBy}`.

### 11.3 `src/lib/data/groups/finance.ts` (게터)
- `import "server-only"; import { sb, nowKstParts } from "@/lib/data/db"; import { monthLabelFromKst } from "@/lib/data/kst-bounds";` + finance-calc import. 스튜디오 전체, 내부 가드 없음(페이지 게이팅 의존).
- 타입 export: `ExpenseItem { id; category; categoryLabel; amount; date:'YYYY-MM-DD'; dateLabel:'MM.DD'; note:string|null; source; trainerName?:string }`, `ExpensesView { monthOffset; monthLabel; items[]; byCategory:{key,label,amount}[]; total }`, `FinanceSummary { monthOffset; monthLabel; revenue; expenseTotal; netProfit; byCategory:{key,label,amount,pctOfRevenue:number|null}[]; netPrev; netDeltaPct:number|null }`.
- **월 파생/필터:** getSettlement L25 규약 그대로. 경계는 **문자열** `firstThis`/`firstNext`(`>=`/`<`), 타임스탬프 경계 금지. slice 아님.
- `getExpenses`: `.select("…, trainers(display_name)")` 임베드(getOutstanding 선례), `.order(spent_at desc).order(created_at desc)`. `trainerName = row.trainers?.display_name ?? undefined`. `categoryLabel`은 게터가 `CATEGORY_LABELS`로 계산. `byCategory`도 **`amount` 내림차순**(§11.2와 통일).
- `getFinanceSummary`: 4쿼리(payThis/payPrev/expThis/expPrev) `Promise.all`, `sum=(rows)=>Σ(amount??0)` (getStudioOps sumAmount 선례), 계산은 `summarizeFinance` 위임. `monthLabelFromKst(target)`.

### 11.4 `src/lib/data/groups/finance-actions.ts` (`"use server"`, Result=`{ok,error?}`)
- `CATEGORIES` const로 category 검증. 검증 순서 = addRevenue(로그인→owner→금액→분류). 에러 카피: `"금액을 입력해주세요"`/`"분류를 선택해주세요"`/`"지출 추가에 실패했어요"`.
- `addExpense`: `spent_at: input.spentAt || todayISO()`, `amount:Math.round`, `trainer_id: category==='labor' ? (trainerId??null) : null`, `source:'manual'`, `recorded_by:t.id`.
- `deleteExpense(id)`: **source 사전조회 → `settlement`면 거부** `"정산 지급 항목은 정산 화면에서 취소해주세요"`, 아니면 `.delete().eq("id",id)`.
- `monthKeys(off)` 헬퍼(⚠️ `Date.UTC(...)`는 number → 반드시 `new Date(...)` 후 `toISOString().slice`): `monthKey = new Date(Date.UTC(y, m−off, 1)).toISOString().slice(0,7)`, `lastDay = new Date(Date.UTC(y, m+1−off, 0)).toISOString().slice(0,10)` (순수 UTC-midnight, tz 무오염). `y,m = nowKstParts()`의 연·월.
- `confirmSettlement(off=0)`: `getSettlement(off)` → **`delete().eq(source,settlement).eq(settle_month,monthKey)` 먼저** → `settlementLaborRows(...)` insert(rows>0일 때만). revalidate `/console/settlement`·`/console/finance`·`/t/perf`. `// ponytail: delete→insert 비원자적(2요청), 실패 시 미확정 롤백 → 재클릭 자기치유.`
- `unconfirmSettlement(off=0)`: 그 달 정산행 `delete` + 동일 revalidate. 카피 `"확정 취소에 실패했어요"`.

### 11.5 `settlement.ts` — `getSettlement`에 `confirmed`
- Settlement 타입에 `confirmed:boolean`. `target`(L27) 직후 `monthKey='YYYY-MM'` 파생(confirmSettlement와 동일). 비오너 조기반환에 `confirmed:false`. 오너 Promise.all에 3번째 쿼리 `sb.from("expenses").select("id").eq("source","settlement").eq("settle_month",monthKey).limit(1)` → `confirmed:(settleRows?.length??0)>0`. **page.tsx 무수정**(객체 통째 전달).

### 11.6 `console/settlement/ui.tsx` — 토글 + 모달
- L13 구조분해에 `confirmed` 추가. 월-nav 행: 합계 pill을 `<div className="ml-auto flex items-center gap-3">`로 감싸고 오른쪽에 신규 `ConfirmControl`.
- `ConfirmControl`(ui.tsx 내부 client): **표시 규칙**(대표 단독 매장 stuck-state 방지) — `payableCount = rows.filter(r=>r.payout>0 && r.role!=='owner').length`.
  - `confirmed=true` → `지급 완료` 배지(#5B6452/#EDF4E3) + `확정 취소` 고스트 (항상 표시).
  - `confirmed=false && payableCount>0` → `지급 확정` 버튼.
  - `confirmed=false && payableCount===0` → **컨트롤 숨김**(지급할 비오너 강사 없음 = 확정할 인건비 없음. 무진행 달·대표 단독 달 모두 커버 → 눌러도 0행 insert되는 무한 no-op 제거). `total<=0` 단독 가드는 대표 payout>0 달을 못 걸러 폐기.
  - 확인은 **`ConsoleModal`**(신규 컴포넌트 금지). 
- 모달 카피: confirm 본문 "이 달 정산을 지급 확정할까요? **인건비 지출**로 반영돼요." / unconfirm 본문 "이 달 정산 확정을 취소할까요? 반영된 **인건비 지출**이 삭제돼요."(액션버튼 terracotta). `run(kind)`=busy/toast/`router.refresh()` (trainers 삭제 패턴). import `confirmSettlement/unconfirmSettlement`.
- 하단 info 박스(L50) 끝에 1문장 추가: "**지급 확정**하면 이 달 인건비가 **손익** 화면에 지출로 반영돼요."

### 11.7 `console/finance/` — `page.tsx`(서버) + `ui.tsx`(client `ExpenseLedger`)
- page.tsx: `searchParams {m?}` → `off=Math.max(0,Number(sp.m)||0)`, `Promise.all([getFinanceSummary(off), getExpenses(off), getStaff()])`. `requireOwnerPage` 호출 안 함(revenue 선례, 레이아웃 게이팅). `staffPicks = staff.filter(s=>s.role!=='invited').map(s=>({id,name}))`.
- Topbar `title="손익" sub={`${monthLabel} · 손익 요약`}`. 월-nav = settlement `NavArrow` 마크업 복제(로컬 non-export라 import 불가), 링크 `/console/finance?m=`.
- **히어로**(전폭, revenue 박스 차용): bg `netProfit>=0 ? #768C6A : #C67352`, 순이익 `serif text-[38px]`(Money+won, 음수 부호 자동), delta 배지는 `netDeltaPct!=null`일 때만, 보조숫자 매출/지출.
- **지출 구성**: 카테고리별 개별 가로바(revenue 결제수단 단일 stacked 아님). `CAT_COLOR={labor:#768c6a,rent:#b89a5e,utility:#6e8aa0,marketing:#c67352,supply:#8fa187,etc:#a89a80}`. `amount>0`만, amount desc. **경고 pill**: `rent&&pct>20 || labor&&pct>60`이면 terracotta pill+%텍스트 terracotta(문구 "권장 초과"). % Money 미적용.
- **지출 장부**(client): 컬럼 날짜/분류·메모/강사/금액. `source==='settlement'`행 → "정산 지급" 배지 + **삭제버튼 숨김**. 빈 목록 "이번 달 지출이 없어요".
- **지출 추가 모달**: `ConsoleModal`(실존 `components/console/ui.tsx`). native `<select>`(6 CATS)+금액+`<input type=date>`(기본=KST 오늘)+메모, `category==='labor'`일 때만 강사 `<select>`(staffPicks, "선택 안 함"=기본). 성공 toast "지출을 추가했어요". 삭제 모달 카피 "이 지출 기록을 삭제할까요? 되돌릴 수 없어요.". Money=금액에만.

### 11.8 모바일 `t/perf/page.tsx` — 순이익 스트립
- header `</div>` 다음, 2×2 grid **위**에 전폭 인라인 카드(Metric 컴포넌트 미사용 — 값 색 커스텀 불가). Promise.all에 `getFinanceSummary(0)` 4번째로 추가(import 1줄). `won()` 로컬 재사용, Money 미적용.
- `netProfit<0` → `bg-warm-banner`+값 `text-terracotta`, else `bg-sage-banner`+`text-ink`. 라벨 "이번 달 순이익", 보조 "매출 {won} · 지출 {won}", delta 배지는 `netDeltaPct!=null`일 때.

### 11.9 테스트 + 배선
- **테스트** `src/lib/data/finance-calc.test.ts`(`bun test`): `summarizeFinance` netProfit=매출−지출, byCategory 합=expenseTotal, prevNet<=0→null·prevNet>0→값; `settlementLaborRows` owner·payout0 제외(length·trainer_id·note 검증). 순수 모듈이라 DB 불필요. (DB 거동=통합/수동 영역.)
- **Sidebar** NAV: settlement 다음 `{ key:"finance", label:"손익", href:"/console/finance", icon:"chart", activeIcon:"chart" }`(fill 변형 없어 동일 지정 — settings 선례).
- **아이콘** "chart": `icon-data.ts`는 AUTO-GENERATED → 직접 편집 금지. `docs/design-handoff/pt-icons.js`에 filled 막대 3개 글리프 추가 후 `bun run scripts/gen-icons.ts`. (정식 글리프 원하면 상위 DS에서 교체, 배선 불변.)
- **`deleteInstructor`(trainer-actions.ts L192-195)**: `payments.recorded_by` null-out 옆에 `expenses.recorded_by` null-out 1줄 추가(패턴 일관·방어적). 현재는 대표만 지출 기록 + 대표 미삭제라 FK 도달 불가하나, `recorded_by`는 `on delete` 절 없음(NO ACTION)이므로 패턴 일치가 안전. (⚠️ 삭제 강사 정산 FK 위반은 **불가** — `deleteInstructor` L188-190이 과거 수업 있는 강사 하드삭제를 이미 차단.)

### 11.10 잔여 = 순수 미관(동작 무관, 구현 중 교체 가능)
1. 경고 pill 문구 "권장 초과" 톤(예 "임대료 과다"). 2. `CAT_COLOR` 6색(revenue 팔레트 유추). 3. "chart" 아이콘 최종 아트. — **셋 다 로직·상태·돈에 영향 0.**

### 11.11 3차 적대 검증 반영 (동작 잔여 → 0)
독립 스켑틱 3명 검증(참조 심볼 전량 실존 확인). 발견된 **동작적** 잔여를 전부 해소:
- **대표 단독 매장 확정 no-op**(3명 공통 지적, 실 결함) → §11.6 `payableCount===0`이면 확정 컨트롤 숨김으로 해소.
- **본문 §5 spent_at 공식에 `−off` 누락** → 본문·§11.4 모두 `m+1−off`로 교정(과거 월 확정 오기록 방지).
- **`monthKeys`의 `Date.UTC().slice` 표기 오류** → `new Date(...).toISOString().slice`로 교정.
- **finance-calc가 server-only `SettlementRow` import 시 `bun:test` crash** → 로컬 `LaborInput` 구조 타입으로 분리(import 제거).
- **byCategory 정렬 본문↔부록 불일치** → 전부 `amount` 내림차순 통일.
- **삭제 강사 FK 위반**(1명 지적) → **불가**로 판정: `deleteInstructor`가 수업 기록 있는 강사 하드삭제를 차단(코드 확인). `expenses.recorded_by` 방어 null-out만 §11.9에 추가.

**검증 평결:** 참조 심볼·배선(레이아웃/미들웨어 게이팅·Sidebar active·gen-icons·apply-migration) 전량 실존, 돈·멱등·월경계·권한 확정. **동작·구조 잔여 추측 = 0.** 남은 것은 §11.10의 미관 3건뿐.
