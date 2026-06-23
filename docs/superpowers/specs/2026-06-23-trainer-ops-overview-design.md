# 트레이너 앱 "실적" 탭 → "운영" (스튜디오 운영 현황) 재구성

작성일: 2026-06-23
대상 화면: `/t/perf` (대표 전용 탭)

## 배경 / 문제

현재 트레이너 앱의 **"실적"** 탭(`coins` 아이콘, 대표에게만 노출)은 차분한 세이지/테라코타
톤의 웰니스 브랜드와 충돌하는 "돈 냄새"가 강하다:

- 페이지 맨 위 히어로가 **"이번 달 매출 기여 ₩2,400,000"** 큰 숫자 + **"+12% ↑"** 성장 화살표.
- 제목이 **"내 실적"** 이고, `getPerf()`는 대표 본인(트레이너로서)의 수업·담당 회원·매출만
  집계한다 (`perf-retention.ts:58-79`). 대표를 수당 받는 트레이너처럼 보이게 만든다.
- 하단 재등록 배너에 **"예상 ₩4.2M"** 금액 노출.

이 앱은 **PT샵을 운영하는 대표용 도구**다. 이 화면은 "내가 얼마 벌었나"가 아니라
"가게가 지금 어떻게 굴러가나"를 보여줘야 한다.

## 목표

1. 탭 정체성을 **"운영"**(운영 현황)으로 바꾸고 돈을 화면에서 **완전히 제거**한다.
2. 숫자 범위를 **대표 본인 → 스튜디오 전체(가게 전체)** 로 바꾼다.
3. 사람·수업·출석 중심의 차분한 운영 대시보드로 만든다.

### 비목표 (YAGNI)

- 매출/정산 화면을 새로 만들지 않는다. 매출은 이 화면에서 빠질 뿐, 별도 결제 기록 흐름은
  기존 그대로 둔다.
- `/t/retention` 상세 페이지의 금액 표기(예상 매출 등)는 이번 범위 밖. 단, owner의 경우
  데이터 범위는 전체로 넓어진다(아래 5절).
- 라우트 경로(`/t/perf`)는 그대로 둔다. `revalidatePath("/t/perf")` 등 참조를 건드리지 않기
  위함. 탭 라벨만 "운영"으로 바뀐다.

## 단일 가게(테넌트) 전제

`TrainerContext`에 `gym_id`가 없고(`context.ts:7-13`), 최근 작업("owner sees all gym
members", "owner can open any trainer's chat")과 `getStaff()`가 전체 트레이너를 무필터로
조회하는 패턴으로 보아 **배포 1개 = 가게 1개**다. 따라서 스튜디오 전체 집계 = `trainer_id`
필터를 빼고 전 테이블을 조회하면 된다. 기존 패턴: `if (t.role !== "owner") q = q.eq("trainer_id", t.id)`.

## 화면 설계 (after)

```
┌───────────────────────────────────┐
│ 2026년 6월                     ⚙   │  월 라벨 + 설정 (기존 유지)
│ 운영 현황                          │  제목: "내 실적" → "운영 현황"
│                                    │
│ ┌────────────────────────────────┐│
│ │ 활동 중인 회원                  ││  세이지 히어로 — 돈이 아닌 '사람'
│ │ 128명          이번 달 신규 6명 ││  (₩ 큰 숫자·+% 화살표 제거)
│ └────────────────────────────────┘│
│                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │이번 주│ │출석률 │ │트레이너│       │  스튜디오 전체 stat 3종
│ │  96  │ │ 88%  │ │  6명  │        │
│ │ 수업 │ │      │ │       │        │
│ └──────┘ └──────┘ └──────┘        │
│                                    │
│ ┌────────────────────────────────┐│
│ │ 주간 수업              96타임   ││  전체 트레이너 합산 주간 차트
│ │ ▁ ▃ ▅ █ ▅ ▂                   ││
│ └────────────────────────────────┘│
│                                    │
│ ┌────────────────────────────────┐│
│ │ ↻ 재등록 관리가 필요한 회원      ││  "예상 ₩4.2M" 제거 → 사람 중심
│ │   만료 임박 8명              ›  ││  탭 시 /t/retention (owner=전체)
│ └────────────────────────────────┘│
└────────────────────────────────────┘
```

**화면에 ₩ 표기는 한 군데도 없다.**

## 데이터 계약

### 새 타입 `StudioOverview` (`src/lib/types.ts`)

```ts
export interface StudioOverview {
  monthLabel: string;     // "2026년 6월"
  activeMembers: number;  // 가게 전체 활성 회원 수
  newThisMonth: number;   // 이번 달(KST) 신규 가입 회원 수
  weekClasses: number;    // 이번 주(월~토, KST) 수업 타임 수 — 전체 트레이너
  attendRate: number;     // 이번 달 전체 출석률 (%)
  trainerCount: number;   // 활성 트레이너 수 (status='active')
  weeklyBars: PerfBar[];  // 같은 이번 주(월~토) 수업의 요일별 분포 — 합이 weekClasses와 일치
  expiringCount: number;  // 14일 내 만료 임박 활성 회원권 수 — 전체
}
```

- `PerfBar`(기존)는 재사용. `PerfSummary`/`getPerf()`는 이 화면에서 더 이상 쓰지 않으므로
  live 코드(`perf-retention.ts`의 `getPerf`)를 제거한다. `mock.ts`의 mock 변형은 건드리지 않는다.

### 새 함수 `getStudioOverview()` (`src/lib/data/groups/owner-ops.ts`)

owner 운영 모듈에 추가. 모든 쿼리는 **무필터(가게 전체)**. 월 경계는 `monthBoundsKst` 재사용,
주 경계(월~토)는 `weekBoundsKst` 헬퍼를 신설(둘 다 KST).

| 필드 | 쿼리 |
|---|---|
| `activeMembers` | `memberships` `status='active'`의 distinct `member_id` 수 |
| `newThisMonth` | `members` `created_at`가 이번 달 범위 내인 행 수 |
| `weekClasses` | `sessions` `scheduled_at`이 이번 주(월~토) 범위 내인 행 수 (상태 무관) |
| `attendRate` | 이번 달 `sessions` 중 `attended / (attended + noshow)`, 분모 0이면 100 |
| `trainerCount` | `trainers` `status='active'` 행 수 |
| `weeklyBars` | 위 이번 주(월~토) sessions를 요일별로 버킷팅 → 기존 `buildWeeklyBars` 로직 재사용 |
| `expiringCount` | 활성 `memberships` 중 `end_date` D-day 0~14 행 수 (전체) |

주(월~토) 경계는 KST 기준 `weekBoundsKst` 헬퍼를 신설해 `weekClasses`와 `weeklyBars`가
**같은 sessions 집합**에서 나오도록 한다. 차트 헤더의 "N타임" = `weekClasses` = 바 합계
(단일 진실 공급원).

### `getRetention()` owner 인지화 (`perf-retention.ts`)

`/t/retention`은 트레이너 홈·회원 상세에서도 진입 가능(`t/ui.tsx:86`, `members/[id]/page.tsx:99`)
하므로 **owner면 전체, 강사면 본인 범위**로 분기:

```
const t = await getTrainerContext();
const isOwner = t?.role === "owner";
// isOwner: member_trainers 링크 단계를 건너뛰고 활성 memberships 전체 조회
// else:    기존대로 member_trainers로 member_id 범위 한정
```

`expectedRevenue` 반환값 자체는 유지(상세 페이지가 이미 소비). 운영 현황 **배너**에서만
금액을 노출하지 않는다.

## 변경 파일

1. `src/components/trainer/tabs.ts` — `{ label: "실적", icon: "coins", activeIcon: "coins-fill" }`
   → `{ label: "운영", icon: "home", activeIcon: "home-fill" }`. href `/t/perf` 유지.
2. `src/lib/types.ts` — `StudioOverview` 추가.
3. `src/lib/data/groups/owner-ops.ts` — `getStudioOverview()` 추가 (+ 필요 시 주 경계 헬퍼).
4. `src/lib/data/groups/perf-retention.ts` — `getPerf()` 제거, `getRetention()` owner 분기.
5. `src/app/(app)/t/perf/page.tsx` — 전면 재작성:
   - 제목 "내 실적" → "운영 현황".
   - 매출 히어로 카드 제거 → "활동 중인 회원 N명 / 이번 달 신규 N명" 히어로.
   - stat 3종: 이번 주 수업 / 출석률 / 트레이너.
   - 주간 차트: 전체 합산.
   - 재등록 배너: "재등록 관리가 필요한 회원 · 만료 임박 N명" (₩ 제거).
   - `getPerf` import 제거, `getStudioOverview` 사용.

## 엣지 케이스

- 데이터 없음(미인증/빈 가게): 모든 수치 0, 출석률 100, 빈 차트. 기존 `getPerf`의 null 가드
  패턴을 `getStudioOverview`에도 적용.
- `weekClasses`/`weeklyBars`가 0이면 차트는 최소 높이 바(기존 `buildWeeklyBars`가 8px 하한 처리).
- `expiringCount` 0이면 배너는 그대로 노출하되 "만료 임박 0명" — 또는 0일 때 배너 숨김
  (구현 시 0명이면 숨김 권장, 빈 상태 깔끔).

## 검증

- 타입 체크 / 빌드 통과 (`bun run build` 또는 프로젝트 빌드 스크립트).
- 대표 계정으로 `/t/perf` 진입 시: 탭 라벨 "운영" + home 아이콘, 화면에 ₩ 0회, 숫자가
  스튜디오 전체(여러 트레이너 합산) 기준인지 확인.
- 배너 탭 → `/t/retention`이 owner에게 전체 회원 기준으로 뜨는지 확인.
- 강사 계정엔 영향 없음(탭 자체가 owner 전용; `/t/retention`은 본인 범위 유지).
