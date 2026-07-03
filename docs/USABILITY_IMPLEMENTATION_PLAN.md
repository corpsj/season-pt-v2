# 사용성 개선 구현계획 (실행판)

> **원본:** `docs/USABILITY_IMPROVEMENT_PLAN.md` (v1.0)
> **이 문서:** 원안을 코드베이스 실사(4방향 정찰) 결과로 평가·정정하고, 즉시 구현 가능한 범위(Wave 1)를 태스크 스펙 수준으로 확정한 실행 문서. 구현 에이전트는 이 문서를 단일 소스로 삼는다.
> **고정 제약(불변):** ① 회원 비밀번호 = 생년월일 6자리, ② 회원 탈퇴 셀프 불가.
> **작성일:** 2026-07-03 · 기반 커밋: 4049254

---

## 1. 원안 평가 — 실사로 확인된 정정 사항

| 항목 | 원안 주장 | 실사 결과 | 판정 |
|---|---|---|---|
| C-2 수신 단건 | `getMemberReceive` 한 건만 반환 | 사실. `limit(1).maybeSingle()` — 복수 pending 시 최신 1건만 노출 (`member.ts:439`) | **유효, 최우선** |
| B-1 정산 미노출 | `/t/stats` 금액 정보 전무 | 사실. `getMyStats`는 횟수/회원수만. `getSettlement`는 non-owner 빈값 반환 | **유효, 최우선** |
| C-3 상태 표시 부재 | seen 필드 없음 | 사실. `seen_at` 계열 컬럼 0건, 회원 보낸 요청 조회 화면 없음 | **유효** |
| A-4 정산 투두 부재 | 대시보드에 미확정 노드 없음 | 사실. `console/page.tsx` todos는 만료임박/대기요청/미답채팅 3종뿐 | **유효** |
| A-2 전역 검색 부재 | 섹션별 검색만 | 사실. `searchAll` 류 액션 0건 | **유효** |
| A-5 겹침 시각화 | PC·모바일 8px 오프셋 | **절반 기각.** PC `WeekGrid.tsx`는 이미 레인 분할(클러스터+lane) 구현 완료. 8px 오프셋은 모바일 `t/ui.tsx`만 해당 | **모바일만** |
| B-3 헤더 밀집 | 여백 부족·오탭 | **대부분 기각.** 간격 이미 `gap-2`(8px), 42px는 DESIGN_SPEC 토큰(헤더 액션 42px/r13). 남는 건 3→2 통합뿐인데 이는 알림센터 리팩터 = Wave 2 | **연기** |
| B-5 Realtime | Supabase Realtime 구독 | **기각.** 회원은 Supabase Auth가 아닌 HMAC 쿠키 세션 + chat 테이블 RLS deny-by-default + 모든 읽기가 서버 service-role 경유. 클라이언트 Realtime은 새 보안 표면을 여는 구조 변경. 폴링은 이미 가시성 기반(`usePolling`) | **기각(구조 유지)** |
| C-1 간편결제 | PG 연동 | **연기.** 토스페이먼츠 등 가맹 계약·심사가 선행돼야 하고 자율 검증 불가. 경량 대체(C-1L)로 갭 축소 | **연기+경량 대체** |
| X-2 PWA 캐시 | 오프라인 캐시 전략 | **부분 기각.** `public/sw.js`는 의도적으로 network-only(캐시 0, Android `beforeinstallprompt` 발화 전용). 캐시 도입은 이 결정과 충돌 → 오프라인 배너만 | **배너만** |
| X-1 Lighthouse ≥95 | axe CI 게이트 | **재정의.** 측정 파이프라인 없음. 검증 가능한 구체 항목(Toast aria-live)으로 환원. 42→44px 확대는 스펙 토큰 위반이라 제외 | **축소** |
| C-4 24h 규칙 | 24h 무료 규칙 언급 | 정정: 실제 정책은 `studio_settings.cancel_cutoff_hours = 12`. 14일 칩 한계는 사실 | **유효(문구만 정정)** |
| C-3 '만료' 상태 | 상태 칩에 만료 포함 | `request_status` enum은 pending/accepted/rejected 3종. '만료'는 파생 표시(세션 시각 경과)로 처리, enum 변경 없음 | **파생으로 구현** |

**원안의 강점(유지):** 역할별 갭 분석과 P0 3종(B-1·C-2·C-3)의 선정은 정확했다. 완료 기준(DoD) 중심 서술도 그대로 계승한다.

---

## 2. 스코프 결정

### Wave 1 — 이번 구현 (본 문서의 대상)
코드만으로 완결·검증 가능하고 파급이 통제되는 12건. 아래 §3 스펙 참조.

### Wave 2 — 다음 라운드 (설계만 합의, 구현 보류)
- **B-2** 강사 회원 등록 요청 위임 — 승인 파이프라인 + 대기 상태 설계 필요. '임시 회원 캘린더 점선 카드'는 상태 머신 복잡도 대비 가치 낮아 제외하고, `등록 요청 → 대표 알림 → 콘솔 승인 시 createMember 실행`의 3단계로 축소해 진행.
- **B-3** 인박스+알림 → 알림센터 통합(헤더 아이콘 3→2).
- **A-3** 콘솔 반응형(≤1280px 사이드바 아이콘 모드) — 브라우저 검증 필요.
- **X-3** 빈 상태·로딩 일관성 일괄 정비(스윕성 작업).
- **X-4** 알림 인박스 분류·일괄읽음.

### Wave 3 — 외부 의존/보류
- **C-1** PG 간편결제 + **C-6** 영수증 — PG 가맹 계약 체결 후. 결제 인증은 원안대로 생년월일 재확인 + 결제 PIN.
- **A-6** 매니저 역할 — 다인 운영 수요가 실재할 때. 권한 모델 확장은 감사 이력상 리스크 큼.
- **X-5** 다국어.
- **B-5** 채팅 실시간화 — 아키텍처 결정(폴링) 번복 사유가 생길 때만.

---

## 3. Wave 1 태스크 스펙 (12건)

각 태스크: **현황 → 변경 → 파일 → DoD**. 파일 경로는 정찰로 검증된 실측 기준.

### 클러스터 M — 회원 (`/m`)

#### M1. 수신 화면 다중 요청 처리 (원안 C-2, P0)
- **현황:** `getMemberReceive()`/`getMemberReceiveMeta()`가 `order created_at desc → limit(1)`로 최신 1건만 반환(`src/lib/data/groups/member.ts:419-503`). 홈 배너는 count를 boolean으로 버림(`member.ts:188-200`, `hasTrainerReq`).
- **변경:**
  1. `member.ts`에 `getMemberReceiveList(): Promise<MemberReceiveItem[]>` 신설. `MemberReceiveItem = { requestId, trainerName, ago, type: "change"|"cancel", before, reason?, sessionId, slots: { id, label, iso }[] }`. 기존 두 getter(view/meta) 통합 — iso를 항목에 직접 포함해 이중 조회·레이스 제거. 기존 `getMemberReceive`/`getMemberReceiveMeta`는 사용처가 `m/receive/page.tsx`뿐이므로 삭제.
  2. `m/receive/page.tsx` + `ui.tsx`: 카드 스택 목록으로 개편. 상단 "받은 요청 N건". 카드별 독립 수락/거절(기존 `acceptMemberChange(requestId, slotIso?)` / `rejectMemberChange(requestId)` 그대로 사용, 시그니처 변경 없음). 처리 후: 남은 건 있으면 목록 갱신(`/confirm?to=/m/receive`), 없으면 `/m`. 빈 목록은 기존 EmptyState 유지.
  3. `getMemberCalendar()`: `hasTrainerReq`를 유지하되 `trainerReqCount: number` 추가(이미 count 쿼리 존재, 버리던 값 노출). `m/ui.tsx` 배너에 2건 이상일 때 "N건" 표기.
  4. `/m/receive` 진입 시 해당 trainer-sent pending 요청의 `seen_at` 기록(M2의 컬럼 활용 — 강사 '보낸 요청' 탭 확인 표시의 대칭 데이터).
- **파일:** `src/lib/data/groups/member.ts`, `src/app/(app)/m/receive/page.tsx`, `src/app/(app)/m/receive/ui.tsx`, `src/app/(app)/m/ui.tsx`
- **DoD:** pending 트레이너 요청 2건 이상 시 전부 목록 노출·건별 처리 가능, 홈 배너에 건수, 처리 완료 시 잔여 건 수 갱신.

#### M2. 요청 상태 표시 + 보낸 요청 히스토리 (원안 C-3+C-5, P0)
- **현황:** `schedule_change_requests`에 열람 흔적 컬럼 없음(0001 마이그레이션, 컬럼 목록 실측). 회원은 요청 발송 후 상태를 볼 화면이 없음. `notifyRequestResult()`(`notifications.ts:89`)는 recipient-agnostic 헬퍼로 이미 존재.
- **변경:**
  1. **마이그레이션 `supabase/migrations/0023_request_seen.sql`** (최신 번호 0022 확인됨):
     `alter table schedule_change_requests add column if not exists seen_at timestamptz;`
     의미: **상대방이 처음 열람한 시각**(회원 요청→강사 인박스 열람, 강사 제안→회원 수신 화면 열람).
  2. `member.ts`에 `getMemberSentRequests()` 신설 — `requester_type='member' and requester_id=me.memberId`, 최근 30일, `created_at desc`. 세션 시각 라벨 포함. 상태 파생 규칙: `accepted`→수락 / `rejected`→거절 / `pending && seen_at`→확인함 / `pending && !seen_at`→대기 중 / `pending && 세션 원시각 경과`→기간 지남(파생, enum 불변).
  3. 신규 페이지 `/m/my/requests`(page + ui) — 상태 칩 목록. `m/my/ui.tsx` '내 활동' Card에 MenuRow "일정 요청 내역" 추가(`/m/my/payments` 행 인근).
  4. 강사 인박스 열람 시 seen 기록: `scheduling-actions.ts`에 `markInboxSeen()` 신설(트레이너 컨텍스트 가드, 본인 세션의 member-sent pending 중 `seen_at is null`만 일괄 update) → `t/inbox/page.tsx`에서 호출. **주의: 이 항목은 클러스터 T 파일을 만지므로 T가 구현한다(§4 파일 소유권). M은 회원 측만.**
  5. 알림 보강: `acceptRequest`/`rejectRequest`(`scheduling-actions.ts:427~`)가 처리 결과를 **회원에게** `notifyRequestResult({recipientType:"member", ...})`로 알리는지 확인, 누락 시 추가. (이 역시 T 소유 파일 — T가 수행.)
- **파일(M 소유분):** `supabase/migrations/0023_request_seen.sql`, `src/lib/data/groups/member.ts`, `src/app/(app)/m/my/requests/page.tsx`(신규), `src/app/(app)/m/my/requests/ui.tsx`(신규), `src/app/(app)/m/my/ui.tsx`
- **DoD:** 회원이 보낸 요청의 상태(대기/확인함/수락/거절/기간 지남)를 마이페이지에서 조회 가능. 강사가 인박스를 열면 '확인함'으로 전환. 수락/거절 시 회원 알림 수신.

#### M3. 14일 한계 안내 + 채팅 초안 프리필 (원안 C-4, P1)
- **현황:** 날짜 칩은 `kstDays(14)` = 오늘~13일 후(`m/request/ui.tsx:27-47`). 초과 일정 안내 없음. `/m/chat`은 searchParams 미지원, draft는 항상 `useState("")`(`chat/ui.tsx:45`).
- **변경:**
  1. `m/request/ui.tsx` 날짜 칩 하단에 Banner: "2주 이후 일정은 선생님께 채팅으로 문의해 주세요" + "채팅으로 문의" 링크 → `/m/chat?draft=` + encodeURIComponent("수업 일정 변경 문의드려요. 원하는 날짜: ").
  2. `m/chat/page.tsx`: `searchParams`의 `draft`를 읽어 `MemberChatClient`에 `initialDraft` prop 전달. `chat/ui.tsx`: `useState(initialDraft ?? "")`. **자동 발송 금지** — 초안만 채우고 회원이 직접 전송.
- **파일:** `src/app/(app)/m/request/ui.tsx`, `src/app/(app)/m/chat/page.tsx`, `src/app/(app)/m/chat/ui.tsx`
- **DoD:** 14일 한계가 사전 안내되고, 탭 한 번으로 초안이 채워진 채팅으로 이동.

#### M4. 재등록·탈퇴 문의 원탭화 (원안 C-1의 경량 대체 C-1L)
- **현황:** 재등록 버튼이 토스트 "재등록은 선생님에게 메시지로 문의해 주세요"로 종료, 탈퇴도 동일 패턴(`m/my/ui.tsx:100-107, 181`).
- **변경:** 두 버튼을 M3의 draft 프리필 재사용으로 전환 — 재등록: `/m/chat?draft=재등록 문의드려요!` / 탈퇴: `/m/chat?draft=회원 탈퇴 문의드려요.` 토스트 제거. 탈퇴 셀프 불가 제약은 그대로(문의 경로만 단축).
- **파일:** `src/app/(app)/m/my/ui.tsx`
- **DoD:** 재등록/탈퇴 버튼이 막다른 토스트가 아니라 초안 채워진 채팅으로 연결.

### 클러스터 T — 강사 (`/t`)

#### T1. 강사 본인 예상 정산액 (원안 B-1, P0)
- **현황:** `getSettlement()`는 non-owner 빈값 조기 리턴(`settlement.ts:34-35`). 회당 계산은 `pay_rate` 스냅샷 우선, 폴백 `rate_2on1/rate_1on1`(`settlement.ts:49-58`) — 순수 함수로 미추출. `finance-calc.ts`에 순수 계산 모듈 + bun test 패턴 존재.
- **변경:**
  1. 순수 계산 추출: 신규 `src/lib/data/settlement-calc.ts`에 `computePayout(sessions: {type: string; payRate: number | null}[], rate1on1: number, rate2on1: number): { count1on1; count2on1; payout }` — `getSettlement`의 인라인 누적 로직과 **동일 규칙**(스냅샷 우선, 폴백 현재 단가). `settlement.ts`의 인라인 루프를 이 함수 호출로 치환(동작 불변 리팩터).
  2. 신규 getter `getMySettlementPreview()` — `settlement.ts`에 추가. 로그인 강사 **본인**(`t.id`) 스코프만: 이번 달 attended 세션의 `type, pay_rate` + 본인 `rate_1on1/rate_2on1` 조회 → `computePayout`. 반환 `{ monthLabel, count1on1, count2on1, payout } | null`(비로그인 null). **타 강사 데이터·확정 여부·지출 정보는 조회 자체를 하지 않는다.**
  3. `/t/stats`(`t/stats/page.tsx`)에 "이번 달 예상 수입" 카드 — 세리프 대형 금액(기존 강조 스트립 패턴), 서브 "확정 전 예상액 · 노쇼·취소 미포함", 회차 내역(1:1 N회 · 2:1 N회). 단가 미설정(합계 0이고 단가 0)이면 "단가는 대표가 설정해요" 안내로 대체.
  4. 테스트: `src/lib/data/settlement-calc.test.ts` — 스냅샷 우선/폴백/2on1 분기/빈 배열.
- **파일:** `src/lib/data/settlement-calc.ts`(신규), `src/lib/data/settlement-calc.test.ts`(신규), `src/lib/data/groups/settlement.ts`, `src/app/(app)/t/stats/page.tsx`
- **DoD:** 강사가 본인 예상 수입(회차×단가 합) 확인 가능, 타 강사 금액 미노출(코드상 조회 자체 없음), 확정 전 표시 명확, `getSettlement` 기존 동작 불변(기존 finance-calc 테스트 통과).

#### T2. 인박스 '다른 시간 제안' 인라인 (원안 B-4, P1)
- **현황:** 인박스는 수락/거절만(`t/inbox/ui.tsx:103-118`). 수락은 항상 `proposed_slots[0]` 적용(`scheduling-actions.ts:473-474`). 역제안하려면 `/t/class/[id]/propose`로 우회하는데, ① `InboxView.received`에 `session_id`가 없고(`scheduling.ts:405-424`), ② `sendPropose`는 회원 요청 pending 시 차단(`scheduling-actions.ts:321-323`), ③ `loadProposeSlots`는 `ensureOwner` 가드라 강사 사용 불가(`console-actions.ts:53`).
- **변경:**
  1. `scheduling.ts` `getInbox()`: received 항목에 `sessionId` 추가.
  2. `scheduling-actions.ts`에 액션 2개 신설:
     - `loadTrainerProposeSlots(sessionId)` — 트레이너 컨텍스트 + 본인 세션(owner는 전체) 가드 후 `getProposeSlots(sessionId)` 반환.
     - `counterPropose(requestId, slotsIso: string[], reason?)` — 가드: 트레이너 컨텍스트, 요청이 `pending`·`requester_type='member'`·본인 세션. 처리: 해당 회원 요청 `rejected` + `resolved_at` 기록 → `requester_type='trainer', type='change', proposed_slots=slotsIso` 신규 insert → 회원에게 알림 insert(제안 도착, `notifications.ts` 패턴, type `request`). 회원 측 `sendMemberRequest`의 역제안 자동 정리(`member-actions.ts:200-205`)와 대칭 구조.
  3. `t/inbox/ui.tsx`: **변경 요청** 카드에 한해 '다른 시간 제안' 보조 버튼(텍스트/아웃라인) 추가 → 인라인 전개: `loadTrainerProposeSlots` 결과 슬롯(최대 3개 선택, `/t/class/[id]/propose` ui의 RadioOption+커스텀 날짜/시간 행 패턴 재사용) → `counterPropose` 발송 → 토스트 "다른 시간을 제안했어요" → refresh(요청이 pending에서 빠지며 목록 갱신). 페이지 이동 없음. 취소 요청 카드에는 미노출.
- **파일:** `src/lib/data/groups/scheduling.ts`, `src/lib/data/groups/scheduling-actions.ts`, `src/app/(app)/t/inbox/ui.tsx`
- **DoD:** 인박스 변경 요청 카드에서 페이지 이동 없이 대안 시간 제안 가능. 제안 시 원 요청은 정리되고 회원 수신 화면(M1 목록)에 새 제안이 뜬다.

#### T3. 인박스 열람 seen 기록 + 결과 알림 보강 (M2의 강사 측, P0 연동)
- **변경:**
  1. `scheduling-actions.ts`에 `markInboxSeen()` — 본인 세션의 member-sent pending 요청 중 `seen_at is null`을 `now()`로 일괄 update. `t/inbox/page.tsx`에서 렌더 전 호출(실패는 무시, best-effort).
  2. `acceptRequest`/`rejectRequest`가 회원에게 `notifyRequestResult({recipientType:"member", recipientId, kind, accepted})`를 보내는지 확인 후 누락 시 추가. (2:1은 기존 `notifyTeamOfScheduleChange` 경로 존중 — 중복 알림 금지.)
  3. (보너스, 저비용일 때만) `t/inbox` '보낸 요청' 탭 항목에 `seen_at` 기반 "회원 확인함" 표시.
- **파일:** `src/lib/data/groups/scheduling-actions.ts`, `src/app/(app)/t/inbox/page.tsx`, (선택) `src/lib/data/groups/scheduling.ts`·`t/inbox/ui.tsx`
- **DoD:** 강사가 인박스를 열면 회원 화면(M2)의 상태가 '확인함'으로 전환. 수락/거절 시 회원에게 in-app 알림.

#### T4. 4번 탭 라벨 통일 (원안 B-6, P2)
- **현황:** `tabs.ts:15-16` — 대표 `운영`(home 아이콘, `/t/perf`) / 강사 `내 현황`(chart, `/t/stats`, active도 chart).
- **변경:** 두 역할 모두 라벨 **"현황"**, 아이콘 `chart`/`chart-fill`(fill 변형이 `icon.tsx`에 없으면 두 상태 모두 `chart`). href는 역할별 유지(`/t/perf` / `/t/stats`).
- **파일:** `src/components/trainer/tabs.ts`
- **DoD:** 역할 전환 시 4번 탭 라벨·아이콘 동일, 목적지만 권한별.

#### T5. 주간 블록 가독성 + 동시간 겹침 뱃지 (원안 B-7 + A-5 모바일, P2)
- **현황:** `t/ui.tsx` — `HOUR_PX=48`(:198), WeekBlock 제목 10.5px/서브 9.5px(:323,327), 동시각 중복은 우측 8px 오프셋(:258-267, :316). PC 콘솔은 이미 레인 분할이라 **대상 아님**.
- **변경:**
  1. 제목 10.5→11.5px, 서브 9.5→10.5px, `HOUR_PX` 48→54(블록 높이 +6px). 그리드 top/height 산식이 `HOUR_PX` 파생인지 확인 후 일괄 반영.
  2. 동시각 N건: 오프셋은 유지하되 마지막(최상단) 블록 우상단에 "×N" 카운트 뱃지(terracotta 계열 소형 필). 팝오버는 생략 — 뱃지로 '의도된 표시'임만 전달(원안 완료 기준 중 "의도적 시각" 충족, "전체 건 조회"는 일 상세로 갈음).
- **파일:** `src/app/(app)/t/ui.tsx`
- **DoD:** 주간 블록 텍스트 11.5px+, 동시각 2건 이상 시 ×N 뱃지 표시, 기존 스크롤 범위 파손 없음.

### 클러스터 C — 대표 콘솔 (`/console` + `/t/perf`)

#### C1. 미확정 정산 투두 (원안 A-4, P1)
- **현황:** `console/page.tsx:66-72` todos 3종에 정산 없음. `getSettlement`는 `confirmed`(settle expenses 존재 여부)·`stale` 반환. `/t/perf` '오늘 할 일'도 동일 3종.
- **변경:**
  1. 클러스터 T가 소유한 `settlement.ts`에 **T가** 다음 계약대로 getter를 추가한다(§5 계약 1): `getSettlementTodo(): Promise<{ monthKey: string; monthLabel: string; kind: "last" | "current" } | null>` — owner 아니면 null. 로직: `getSettlement(-1)` 결과에 owner 제외 payout>0 행이 있고 `!confirmed`면 `{kind:"last"}`; 아니면 오늘이 KST 25일 이후이고 `getSettlement(0)`이 동일 조건이면 `{kind:"current"}`; 그 외 null.
  2. `console/page.tsx`: todo 추가 — "지난달 정산 미확정"/"이번 달 정산 확정 임박" → `/console/settlement`.
  3. `t/perf/page.tsx` '오늘 할 일'에 동일 항목 — href는 `/console/settlement`(모바일에 정산 화면이 없으므로), sub에 "PC 콘솔 화면이에요" 명시.
- **파일(C 소유분):** `src/app/console/page.tsx`, `src/app/(app)/t/perf/page.tsx`
- **DoD:** 지난달 미확정(강사 지급분 존재) 시 콘솔 대시보드·모바일 대표 홈에 투두 자동 노출, 클릭 시 정산 페이지 이동. 강사 지급분이 0이면 미노출.

#### C2. 콘솔 전역 검색 (원안 A-2, P1)
- **현황:** `Topbar.tsx`에 검색 없음(타이틀+right 슬롯+날짜 필+BellMenu). `searchAll` 류 액션 0건.
- **변경:**
  1. `console-actions.ts`에 `searchAll(q: string)` — `ensureOwner()` 가드. q 2자 미만이면 빈 결과. 병렬 조회(각 limit 5):
     - 회원: `members` name/phone ilike → `/console/members?q=` 딥링크(members 페이지가 검색 파라미터를 안 받으면 `/console/members` + 결과 라벨에 이름 표기로 대체 — 구현 시 확인).
     - 강사: `trainers` display_name ilike → `/console/trainers`.
     - 요청: 이름 매칭 회원의 세션에 걸린 pending `schedule_change_requests` → `/console/requests`.
     - 메시지: 이름 매칭 회원의 chat thread → `/console/messages`.
     반환: `{ group: "member"|"trainer"|"request"|"message"; id; title; sub?; href }[]`.
  2. 신규 `src/components/console/SearchBox.tsx`(client) — Topbar에 삽입(날짜 필 왼쪽). 300ms 디바운스 → `searchAll` → 그룹핑 드롭다운, ↑↓/Enter 선택, Esc 닫기, 로딩 스피너. 결과 없으면 "검색 결과 없음".
  3. `Topbar.tsx`에 `<SearchBox />` 장착.
- **파일:** `src/lib/data/groups/console-actions.ts`, `src/components/console/SearchBox.tsx`(신규), `src/components/console/Topbar.tsx`
- **DoD:** 콘솔 어느 페이지에서든 헤더 한 입력으로 회원·강사·요청·메시지 검색, 키보드 선택 이동 가능. (원안의 "200ms"는 측정 불가 조건이라 "디바운스+즉시 로딩 표시"로 재정의.)

#### C3. PC·모바일 책임 안내 (원안 A-1의 경량 구현, P0→경량)
- **현황:** 회원 등록 폼이 콘솔 모달과 모바일 풀페이지로 중복이나 **둘 다 동일한 `createMember` 액션을 호출** — 비즈니스 로직 중복은 이미 없음(원안이 요구한 '공유 액션 레이어' 이미 충족). `/t/perf`에 정산·손익 진입점 없음.
- **변경:**
  1. `t/perf/page.tsx` '운영 관리' 섹션 하단에 안내 Banner: "강사 정산·손익·일괄 등록은 PC 콘솔에서 관리해요". (모바일 UI 추가 대신 경계를 명시 — 책임 매트릭스는 §8.)
  2. 폼 통합 리팩터는 하지 않는다(UI 중복은 디바이스 최적화 결과물, 액션 레이어 단일화가 본질이고 이미 달성).
- **파일:** `src/app/(app)/t/perf/page.tsx`
- **DoD:** 대표가 모바일에서 PC 전용 작업의 위치를 안내받음. §8 매트릭스가 문서로 합의됨.

### 클러스터 X — 공통

#### X1. Toast 접근성 (원안 X-1 축소)
- **변경:** `src/components/ui/Toast.tsx` 컨테이너에 `role="status" aria-live="polite"`(error 톤은 `role="alert"`). 42px 터치 타겟은 DESIGN_SPEC 토큰이므로 유지.
- **DoD:** 토스트가 스크린리더에 전달됨.

#### X2. 오프라인 배너 (원안 X-2 축소)
- **변경:** 신규 `src/components/shell/OfflineBanner.tsx`(client) — `online`/`offline` 이벤트 구독, 오프라인 시 상단 고정 얇은 배너 "네트워크 연결을 확인해 주세요"(terracotta), 복구 시 자동 소멸. 루트 `src/app/layout.tsx`에 1회 장착(모바일 셸·콘솔 공통 적용). safe-area는 기존 `var(--safe-t)` 경유.
- **DoD:** 기내모드 전환 시 배너 표시, 해제 시 사라짐. SW 캐시는 건드리지 않음.

---

## 4. 실행 구조 — 클러스터 병렬 + 파일 소유권

구현은 **오푸스 울트라코드 워크플로**로 진행한다. 4개 클러스터 에이전트를 병렬 실행하되, 아래 소유권 표를 벗어난 파일은 수정 금지(동시 편집 충돌 방지).

| 클러스터 | 태스크 | 소유 파일 |
|---|---|---|
| **M** | M1 M2 M3 M4 | `src/app/(app)/m/**`, `src/lib/data/groups/member.ts`, `supabase/migrations/0023_request_seen.sql` |
| **T** | T1 T2 T3 T4 T5 (+C1의 getter) | `src/app/(app)/t/ui.tsx`, `t/stats/**`, `t/inbox/**`, `src/components/trainer/tabs.ts`, `src/lib/data/groups/scheduling.ts`, `scheduling-actions.ts`, `settlement.ts`, `src/lib/data/settlement-calc.ts(.test.ts)` |
| **C** | C1 C2 C3 | `src/app/console/page.tsx`, `src/components/console/Topbar.tsx`, `SearchBox.tsx`, `src/lib/data/groups/console-actions.ts`, `src/app/(app)/t/perf/page.tsx` |
| **X** | X1 X2 | `src/components/ui/Toast.tsx`, `src/components/shell/OfflineBanner.tsx`, `src/app/layout.tsx` |

공유 파일 회피 규칙: `member-actions.ts`·`notifications.ts`는 어느 클러스터도 시그니처 변경 금지(호출만). `notifications.ts`에 신규 헬퍼가 필요하면 T만 추가 가능(M은 기존 헬퍼 호출만).

## 5. 클러스터 간 계약 (컴파일 의존)

1. **T → C:** `settlement.ts`가 export하는 `getSettlementTodo(): Promise<{ monthKey: string; monthLabel: string; kind: "last" | "current" } | null>`. C는 이 시그니처를 신뢰하고 import(병렬 실행 중 미존재 컴파일 에러는 통합 단계에서 해소).
2. **M ↔ T:** `seen_at` 컬럼(0023, M 소유 파일). T는 컬럼 존재를 전제로 코드 작성(파일 충돌 없음, 런타임은 배포 시 마이그레이션 선적용으로 보장).
3. **T → M:** `counterPropose`가 만든 trainer 제안은 M1의 `getMemberReceiveList()`에 자연 유입(같은 테이블, `requester_type='trainer'`).

## 6. 검증 계획

1. **정적:** `bunx tsc --noEmit` 0 에러, `bun test` 전체 통과(신규 `settlement-calc.test.ts` 포함, 기존 `finance-calc.test.ts` 회귀 무), `bun run build` 성공.
2. **에이전트 검증(울트라코드 verify 단계):** 클러스터별 독립 검증자가 DoD 항목별 코드 확인 + 적대적 관점 —
   - 권한: `getMySettlementPreview` 타 강사 데이터 미조회, `searchAll` `ensureOwner`, `counterPropose`/`loadTrainerProposeSlots` 세션 소유권, `markInboxSeen` 본인 세션 스코프.
   - 회귀: `getSettlement` 계산 불변(추출 리팩터), 수락 slot0 로직 불변, 알림 중복 발송 없음(2:1 경로).
   - UI 정합: 디자인 토큰(색·라운드·타이포) 준수 — ui-coherence 리뷰.
3. **수동 스모크(배포 후 사용자):** ① 강사 계정(`staff`)으로 `/t/stats` 예상 수입 확인 ② 회원 요청 2건 만들어 `/m/receive` 목록 확인 ③ 요청 보내고 강사 인박스 열람 → `/m/my/requests` '확인함' 전환 ④ 인박스 '다른 시간 제안' → 회원 수신 확인 ⑤ 콘솔 검색 ⑥ 말일 근처 정산 투두.

## 7. 배포 절차

1. 격리 워크트리에서 구현(공유 트리의 자동 커밋 세션 간섭 회피) → main 병합.
2. `git push origin main`
3. `bash scripts/deploy-prod.sh supabase/migrations/0023_request_seen.sql` — 마이그레이션 선적용 후 Vercel 배포(스크립트가 순서 보장).

## 8. 대표 책임 매트릭스 (A-1 합의안)

| 작업 | PC 콘솔 | 모바일 `/t` |
|---|---|---|
| 운영 현황·투두 | ✅ 대시보드 | ✅ 현황 탭(요약) |
| 캘린더·출석 | ✅ 조회·조율 | ✅ **주 사용처**(출석 처리) |
| 회원 등록(단건) | ✅ 모달 | ✅ 풀페이지 폼 |
| 회원권 발급·연장·환불 | ✅ **전용** | 발급만(등록 흐름 내) |
| 강사 정산·단가 | ✅ **전용** | 조회 없음 → 안내 배너 |
| 손익·지출 | ✅ **전용** | 순이익 요약만 |
| 매출 장부 | ✅ | ✅ |
| 채팅·요청 처리 | ✅ | ✅ |

---

*문서 버전: v1.0(실행판) · 원본 계획 v1.0 기반 · 정찰 검증 완료 2026-07-03*
