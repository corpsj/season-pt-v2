# 실무용 대표 트레이너 기능 개선 — 설계 (2026-06-25)

## 배경

대표 트레이너 관점 사용성 평가에서 **"돈 버는 동선"이 비어 있다**는 점이 드러났다(검증 완료):

- 회원권을 발급하는 정상 UI 경로 없음(설정 링크는 `m_iji` 한 명에 하드코딩, 회원 상세엔 발급 버튼 없음).
- 회원 검색바가 작동 안 함(placeholder `<span>`).
- 결제 금액·결제일 수정 불가(`payments.amount/paid_at` 컬럼은 존재하나 UI가 고정 span).
- 노쇼·취소 차감 규칙이 코드에 하드코딩(`deducted = action !== 'cancel'`), 정책 설정은 "준비 중".
- 회원권 유효기간이 발급일 + 90일 일괄(상품·회차 무관).
- 운동 기록의 종목명·코멘트 입력 불가, 종목 삭제 불가.
- 위험 동작에 확인 다이얼로그 없음, 처리 후 무조건 홈으로 이동.
- 미구현 메뉴 노출("노쇼·취소 정책", "알림 설정", 회원등록의 강사 선택).

본 설계는 이 8개 영역을 실무 투입 가능 수준으로 개선한다. 단일 스튜디오(대표 1인) 구조를 전제한다.

## 확정된 설계 결정

1. **회원권 상품**: 대표가 자유롭게 추가/수정/삭제(CRUD). 회차·가격·유효기간을 상품마다 구성.
2. **알림 설정**: ON/OFF 토글을 영구 저장하는 설정 화면만. 실제 발송 인프라(알림톡 API·푸시)는 범위 밖.
3. **신규 등록 시 회원권**: 등록 폼에 회원권+결제를 포함하되 "나중에" 건너뛰기 허용.
4. **유효기간 단위**: `duration_days`(일). 기본 90일. 상품 폼에서 일수로 편집.
5. **취소 차감 기본값**: `cancel_cutoff_hours = 0`(취소 차감 없음 = 현행 동작). 배포 시 동작 불변, 대표가 정책 화면에서 켜야 차감 시작.

## 데이터 모델 — 마이그레이션 `supabase/migrations/0003_ops.sql`

기존 패턴 준수: 모든 신규 테이블 RLS enable(deny-by-default, service-role 우회). 멱등 작성(`if not exists` / `on conflict do nothing`).

### `membership_products` (대표 관리 카탈로그)
```
id uuid pk default gen_random_uuid()
name text not null            -- "1:1 PT 20회권"
sessions int not null         -- 회차
price int not null
duration_days int not null default 90   -- 유효기간(일)
active boolean not null default true     -- 단종 시 false(소프트)
sort_order int not null default 0
created_at timestamptz not null default now()
```
시드: 10회권(75만/90일), 20회권(140만/90일), 30회권(198만/90일).

### `studio_settings` (단일 행: `id int pk default 1 check (id=1)`)
```
noshow_deducts boolean not null default true       -- 노쇼 차감 여부
cancel_cutoff_hours int not null default 0          -- 0=취소 차감 안 함; N=수업 N시간 전보다 늦은 취소는 차감
notif_expiry boolean not null default true          -- 만료 임박 알림
notif_session boolean not null default true         -- 수업 리마인더 알림
notif_payment boolean not null default true         -- 결제 알림
updated_at timestamptz not null default now()
```
시드: `insert (id) values (1) on conflict do nothing`.

### `exercises` (운동 종목 카탈로그)
```
id uuid pk, name text not null, active boolean default true, sort_order int default 0, created_at
```
시드: 스쿼트·데드리프트·벤치프레스·레그프레스·랫풀다운·숄더프레스·런지·플랭크.

### `memberships.product_id`
`alter table memberships add column if not exists product_id uuid references membership_products(id)` (nullable, 추적용). 기존 스냅샷 컬럼(total_sessions/remaining_sessions/price/end_date)이 권위값 — 레거시 회원권 무영향.

> 결제 금액·날짜는 마이그레이션 불필요(`payments.amount/paid_at` 기존).

## 서버 계층 계약 (이 시그니처대로 Phase 1에서 구현)

### 상품 (owner-only, `ensureOwner`)
- `getMembershipProducts(): MembershipProduct[]` — `membership_products` where `active` order by `sort_order`. (기존 하드코딩 배열 대체. 발급 화면·등록 폼이 사용)
- `getAllProducts()` — 관리 화면용(비활성 포함).
- `createProduct({name, sessions, price, durationDays})`
- `updateProduct(id, {…})`
- `setProductActive(id, active)` — 사용된 적 있는 상품은 삭제 대신 비활성(참조 무결성).

### 운영 설정 (owner-only)
- `getStudioSettings(): StudioSettings` — 단일 행(없으면 기본값).
- `updatePolicy({noshowDeducts, cancelCutoffHours})`
- `updateNotifications({notifExpiry, notifSession, notifPayment})`

### 운동 종목 (owner-only CRUD) + 조회
- `getExercises(): {id,name}[]` — active만, 기록 화면 콤보박스용.
- `getAllExercises()` / `createExercise(name)` / `renameExercise(id,name)` / `setExerciseActive(id,active)`.

### 회원·발급·결제 (확장)
- `createMember(input)` 확장:
  ```
  input += {
    trainerId?: string,                 // 담당 강사(기본 현재 대표)
    product?: { productId: string },     // 회원권(생략 = "나중에")
    payment?: { method, amount?, paidAt? } // 상품 선택 시
  }
  ```
  순서: members insert → member_trainers(trainerId) → 요일별 schedules+schedule_members → product 있으면 issueMembership(end_date = today + product.duration_days, product_id 기록) → payment 있으면 recordPayment.
- `issueMembership(memberId, productId)` — end_date를 상품 `duration_days`로 계산(하드코딩 +90 제거), `product_id` 기록, 스냅샷(total/remaining/price/name) 저장.
- `recordPayment(input)` 확장: `+ amount?: number, paidAt?: string`(미지정 시 상품가/오늘).

### 차감 정책 (핵심)
공용 헬퍼 `shouldDeduct(action, scheduledAtISO, settings)`:
- `attend` → true
- `noshow` → `settings.noshow_deducts`
- `cancel` → `settings.cancel_cutoff_hours > 0 && hoursUntil(scheduledAt) < settings.cancel_cutoff_hours`

적용 위치:
- `confirmAttendance(sessionId, action)` — `deducted = shouldDeduct(...)`로 교체. attendance_ledger의 remaining_before/after 유지.
- `acceptRequest(requestId)`의 cancel 분기 — 세션 cancelled 처리 시 동일 정책으로 차감 + attendance_ledger 기록(취소 시각 = now 기준).
- (`acceptMemberChange`는 일정 변경(reschedule)만 — 차감 없음, 변경 없음.)

## UI 설계 (Phase 2)

### A. 영업 동선
- **`/t/members/register` (통합 등록)** — 섹션: 기본정보(기존) → **담당 강사 드롭다운**(active 강사, 기본 본인) → 정기수업(기존) → **회원권 상품 선택**(카탈로그 또는 "나중에") → 상품 선택 시 **결제수단/금액(상품가 기본·수정)/결제일(오늘 기본)**. 제출 1번. 성공 후 → 해당 회원 상세.
- **`/t/members/[id]` (회원 상세)** — 푸터에 **"회원권 발급" 버튼** 추가 → `/t/members/[id]/membership`(기존 발급 화면, 재등록 경로 확보).
- **`/t/payment` (결제)** — 고정 span → **금액 입력(숫자)·결제일 입력(`type=date`)**. `recordPayment(amount, paidAt)` 전달. 확인 다이얼로그 후 기록. 성공 후 → 회원 상세.
- **`/t/settings/products` (신규, 상품 관리)** — 목록 + 추가/수정/비활성. 필드: 이름·회차·가격·유효기간(일).

### B. 운영 정책
- **`/t/settings/policy` (신규)** — 노쇼 차감 스위치, 취소 차감 기준시간(시간 입력; 0=차감 안 함) + 설명. `updatePolicy`.
- **`/t/settings/notifications` (신규)** — 만료/수업/결제 알림 토글(`Switch`), `updateNotifications`. "실제 발송은 추후" 안내 배너.
- **`/t/attend/[id]`** — 처리 전 **확인 다이얼로그**(차감 결과 명시). 성공 후 → 직전 화면 복귀.
- **`/t/inbox`** — 수락/거절에 **확인 다이얼로그**.
- **`/t/retention`** — "일괄 발송"에 **확인 다이얼로그**.

### C. 기록·검색
- **`/t/record/[id]`** — 종목명을 **콤보박스(카탈로그 선택 + 직접 입력)** 로, 종목명 편집·**삭제(X)** 추가, **코멘트 입력창 작동**(`saveRecord(sessionId, exercises, comment)` 연결).
- **`/t/settings/exercises` (신규, 종목 관리)** — 목록 + 추가/이름수정/비활성.
- **`/t/members` (검색)** — 검색바를 실제 입력으로. 로드된 목록을 이름·연락처로 클라이언트 필터(기존 필터칩과 AND).

### 설정 라우팅 (Phase 1, `settings/ui.tsx`)
- 깨진 `m_iji` 발급 row 제거(발급은 등록·회원상세로 이동).
- rows: 강사 관리 / 회원 등록 / **회원권 상품**(→products) / **운동 종목**(→exercises) / **노쇼·취소 정책**(→policy) / **알림 설정**(→notifications). 전부 실제 라우트.
- 로그아웃에 **확인 다이얼로그**.

## 신규 공용 컴포넌트
- **`ConfirmDialog`** (`src/components/ui/`) — 오버레이 + 제목/설명 + 취소/확인. tone(default/warn). 출석·요청·발송·로그아웃·결제에서 사용.
- **`Select`** — 단순 드롭다운(담당 강사).
- **`Combobox`** — 선택 + 직접 입력(운동 종목). `Select`와 한 파일로 묶거나 분리(구현 재량).

## 서브에이전트 실행 계획 (충돌 없는 파일 분담)

- **Phase 1 — 기반 (순차, 1 에이전트):** `0003_ops.sql` + `ConfirmDialog`/`Select`/`Combobox` + **모든 데이터 계층 변경**(위 계약 전부: 상품/설정/종목 getter·action, `createMember`/`issueMembership`/`recordPayment`/`confirmAttendance`/`acceptRequest` 수정, `shouldDeduct` 헬퍼, 타입 추가) + `settings/ui.tsx` 라우팅·로그아웃 확인. 빌드 통과까지. → **서버 계약 고정.**
- **Phase 2 — UI (병렬 3 에이전트, 파일 분리):**
  - **A 영업:** `register`, `members/[id]`(발급버튼), `payment`, `settings/products`(신규)
  - **B 운영정책:** `settings/policy`(신규), `settings/notifications`(신규), `attend`, `inbox`, `retention`
  - **C 기록·검색:** `record`, `settings/exercises`(신규), `members`(검색)
- **Phase 3 — 검증 (1 에이전트):** `bun run build` + 타입체크/lint, 화면 동선·신규 경로 확인. 독립 검증 후 증거 기반 보고.

파일 교집합 없음: settings/ui.tsx는 Phase 1 전담, 각 UI 에이전트는 서로 다른 라우트 디렉토리만 수정.

## 범위 밖 (YAGNI)
- 실제 알림 발송 인프라(알림톡/푸시 연동, API 키).
- 결제 PG 연동(수기 기록 유지).
- 다중 스튜디오/테넌트.
- 회원권 환불·양도·홀딩(별도 설계 — 트레이너 질문지 답변 후).

## 검증 기준
- `bun run build` 성공, 타입 에러 0.
- 신규 회원을 회원권+결제와 함께 1회 제출로 등록 가능.
- 회원 상세에서 회원권 발급 진입 가능(하드코딩 ID 제거 확인).
- 회원 검색 입력이 목록을 필터.
- 결제 금액·날짜 수정이 `payments`에 반영.
- 정책 화면에서 노쇼 차감 OFF / 취소 기준시간 설정 시 `confirmAttendance`·`acceptRequest` 차감이 바뀜.
- 상품 유효기간 변경이 신규 발급 end_date에 반영.
- 운동 기록에서 종목 선택/직접입력/삭제·코멘트 저장 동작.
- 위험 동작에 확인 다이얼로그 노출.
