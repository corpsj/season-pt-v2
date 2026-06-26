# season-pt_v2 — 대표 관점 전수 감사 & 수정 계획

작성일: 2026-06-27 · 브랜치: `membership-lifecycle`
방법: 7개 병렬 감사 에이전트(돈/라이프사이클, /t 대시보드, /console, 스케줄·출결, 인증·강사·설정, 회원·채팅·알림, UI 일관성) + 신뢰경계 직접 정독. 모든 findings는 실제 코드 file:line으로 검증.

핵심 결론: 화면·시연용으로는 동작하나, **운영 신뢰성에 치명 결함이 있다.** 공통 근인은 (1) 변이 액션의 **원자성/상태 가드 부재**(이중 차감·이중 환불), (2) 만료/세션 라이프사이클의 **백그라운드 전이 부재**(3일 뒤 캘린더 공백, 만료 회원권 영구 active), (3) **인증 fail-open**(공개 대표가입·위조 세션). 아래 순서대로 수정한다.

---

## P0 — 즉시 수정 (데이터 손상 / 돈 / 보안 / 운영 중단)

### A. 변이 원자성 & 상태 가드 (돈 코어)
- **A1 출석 이중 차감** — `src/lib/data/groups/scheduling-actions.ts:38-86` `confirmAttendance`가 세션 `status`를 읽지 않음 + `remaining = remaining-1` 비원자 read-modify-write. 더블탭·재진입·재시도 시 또 차감. `attendance_ledger(session_id, member_id)` unique 없음(0001).
  - 수정: 진입 시 `status='scheduled'` 가드(아니면 거부) + 차감을 조건부/원자 패턴으로. `attendance_ledger`에 `(session_id, member_id)` unique index 추가. 차감 실패 시 ledger 미기록.
- **A2 환불 이중 지급** — `src/lib/data/groups/membership-actions.ts:57-66` 상태 가드와 상태 플립 사이 `previewRefund` 왕복, 트랜잭션 없음, 음수 결제를 상태 플립보다 먼저 insert. 동시/더블클릭 시 음수결제 2건 = 환불 2배.
  - 수정: 순서 역전 + 조건부 전이 — 먼저 `update memberships set status='refunded', remaining_sessions=0 where id=? and status<>'refunded'`를 `.select()`로 실행, 전이 행이 있을 때만 음수 결제 insert. 0행이면 "이미 환불됨".
- **A3 취소요청 재수락 이중 차감** — `scheduling-actions.ts:148-205` `acceptRequest`/`rejectRequest`가 `req.status` 미검사. 이미 처리된 요청 재수락 시 취소 차감 반복.
  - 수정: 로드 시 `status` 포함 → `pending` 아니면 거부. `update().eq('id',id).eq('status','pending')` 원자 전이.

### B. 라이프사이클 백그라운드 전이
- **B1 미래 세션 생성 경로 없음 (운영 중단)** — 코드 어디에도 `sessions` INSERT 없음(시드 스크립트뿐). 시드 세션은 **2026-06-30까지만**. 오늘(06-27) 기준 곧 트레이너/콘솔/회원 캘린더·출석·집계가 전부 공백.
  - 수정: `active` 스케줄 → 향후 N주 `sessions`+`session_members` materialize 생성기. KST weekday/hour/**minute** 반영, `(source_schedule_id, scheduled_at)` 중복 방지. owner 홈 로드 시 best-effort 호출(기존 `scanExpiringMemberships` 패턴) + 크론 seam.
- **B2 `status='expired'` 전이 코드 부재** — 만료일 지나도 영구 `active`. `activeMembers`/`expiringCount` 과대, 만료 회원권 차감 지속.
  - 수정: 만료 스캔에 `update memberships set status='expired' where status='active' and end_date < todayKST` 추가(B1 생성기와 같은 best-effort 묶음).

### E. 인증 fail-open
- **E1 공개 대표 자가가입** — `src/lib/auth/trainer-actions.ts:12-30` `ownerSignup`이 가드 없는 public action, 단일 스튜디오라 외부인이 공동 대표 탈취. 로그인 화면에 가입 링크 노출(`login/trainer/page.tsx:75`).
  - 수정: 부트스트랩 전용 — `trainers where role='owner'` 존재 시 거부. `/signup/owner` 진입도 차단, 링크 제거.
- **E2 위조 가능 회원 세션** — `src/lib/auth/session.ts:5` `MEMBER_SESSION_SECRET || "dev-insecure-secret-change-me"` fail-open. 페이로드 `{memberId,name}`만 → 임의 회원 위장. exp 없음.
  - 수정: prod에서 시크릿 미설정이면 throw(fail-closed). 페이로드에 `exp`(발급+30일) 포함, `verifySession`에서 만료 거부.
- **E3 회원 로그인 무차별 대입** — `member-actions.ts:11-31` 레이트리밋 없음 + 비번=생년월일(6자리) + 비번 변경 경로 없음(`login/member/page.tsx` "비밀번호 변경하기"는 죽은 버튼). 미존재 회원 timing oracle.
  - 수정: 휴대폰별 시도 제한(DB 카운터) + 미존재 회원도 더미 scrypt(timing 평탄). 비번 변경 액션 구현 + 버튼 연결. (단계적: 본 PR에서 fail-closed·비번변경·timing, 레이트리밋 테이블.)

### D. 환불 과지급
- **D1 `list_unit_price=0` → 환불 ~90% 과지급** — `owner-ops-actions.ts:130` `prod.unit_list_price ?? 0`(리터럴 0은 통과). 시드 6종이 0 출하, 모바일 상품폼(`settings/products/ui.tsx:67`)이 unitListPrice 미검증. 환불식 `used×0=0` → 결제액 90% 환불.
  - 수정: 스냅샷·상품 액션에서 폴백 `unit_list_price || round(price/sessions)`. `createProduct/updateProduct`에 `>0` 검증. (콘솔폼은 이미 보정 → 서버에서 통일.)

### F. 시간 계산
- **F1 회원 "다음 수업" +9h 오프셋** — `member.ts:354,410` `nowKstParts().toISOString()` 오용(KST보정된 Date를 ISO화 → 9h 미래). 임박 세션 전부 제외 → 변경/취소 불가.
  - 수정: 두 곳 `new Date().toISOString()`.

---

## P1 — 주요 결함 (운영 불가 / 심각 오인 / 보안 약점)

- **H1 만료윈도 화면 불일치 + "D--10" 깨진 배지** — `trainer-home.ts:518,369,281`이 하한(`dDay>=0`) 없이 만료자까지 "만료 임박"·`D-${음수}` 렌더. 정답은 `perf-retention.ts:42`(`>=0 && <=14`). 회원관리/콘솔 헤더 vs 대시보드 수 어긋남.
  - 수정: `isExpiringWindow(dDay)` 헬퍼로 세 곳 통일 + 음수 D-day floor. (B2 만료 전이가 근본.)
- **H2 활성회원 수 정의 불일치** — `getStudioOps.activeMembers`(active 회원권 보유) vs `getMembersAll.totalActive`(member.status). 같은 콘솔서 다른 수.
  - 수정: 라벨 분리("유효 회원권 보유" vs "등록 회원") 또는 동일 기준 통일.
- **E4 강사 비활성화가 접근 차단 안 함** — `auth/context.ts:28-40` `getTrainerContext`가 `status` 미조회. inactive 강사 계속 로그인·회원 PII 접근.
  - 수정: select에 `status` 추가 → inactive면 null. 로그인도 거부.
- **A4/A5 결제 멱등성 부재** — 다중라인 부분실패 시 재시도 이중결제(`t/payment/ui.tsx:66-81`), `recordPayment`(`owner-ops-actions.ts:180`) 중복방지 없음.
  - 수정: 라인 배열 단일 액션 `recordPayments(lines)`(서버 일괄 insert). 제출 후 버튼 잠금. 단기간 동일 `(membership_id,amount,paid_at)` 중복 경고/차단.
- **A6 createMember 하위 실패 삼킴** — `owner-ops-actions.ts:80-94` 회원권/결제 발급 실패해도 `ok:true`. 매출 조용히 누락.
  - 수정: `issued.ok===false`/결제 실패 시 `partial` 반환 → UI 경고.
- **G1 트레이너 "취소 요청" 가짜 버튼** — `t/class/[id]/ui.tsx:83-98` `toast`만, 서버 호출 없음. 트레이너발 cancel 액션 자체가 없음.
  - 수정: `sendCancelRequest(sessionId, reason)`(type:'cancel' insert) 추가·연결. `getInbox` sent 렌더가 이미 가정.
- **C-cross 활성 회원권 선택 정책 불일치** — 표시 `member.ts:72`(start_date desc) vs 차감 `scheduling-actions.ts:22`/`scheduling.ts:51`(end_date desc). 다중 active 시 회원 표시≠차감.
  - 수정: 단일 헬퍼 통일(권장 `end_date asc` 중 remaining>0 = 임박 우선 소진).
- **I1 콘솔 focus-visible 전무** — `components/console/ui.tsx:72-76`, `members/ui.tsx:381`, `settings/ui.tsx:162`, `ConsoleLogin.tsx:86`. 데스크톱 키보드 내비 불가.
  - 수정: 전 인터랙티브 요소에 `focus-visible:ring-2 focus-visible:ring-sage/40`(Select 기준).

---

## P2 — 실무 적합성 / UX / 일관성

- **G2 "알림톡 보냈어요" 실제 미발송** — `t/retention/ui.tsx:90,130` 플래그만. → 정직 카피 "안내 완료로 표시" + "연동 전" 고지.
- **G3 양도 prompt(UUID) → 사실상 불가** — `MembershipActions.tsx:61`. → 회원 선택 시트. 콘솔엔 양도 버튼 자체 없음(`console/members/ui.tsx`) → 추가(`transferMembership` 존재).
- **G4 양도가 잔여만 이동, 일정/세션 미이전** — `membership-actions.ts:89`. → 미래 sessions/schedule_members 동반 이전 또는 "일정 미이전" 명시.
- **G5 회원 변경요청이 선생님에 미통지** — `member-actions.ts:97-134`. → notification 생성 + inbox 탭 배지.
- **G6 회원 "원하는 시간"이 가짜 슬롯** — `member.ts:384-427`(+1일/+3일 동시각). → `datetime-local` 직접선택.
- **G7 알림 설정 토글 위약** — 쿠키만 저장, 생성기 미반영(`member-actions.ts:219`, `notifications.ts`). → 미구현 토글 "준비 중"/숨김, 살아있는 2종은 회원 설정 반영.
- **G8 공지 하드코딩 가짜** — `member.ts:624-660`. → 가짜 비노출(백엔드는 follow-up).
- **H3 매출 "전월 대비"가 달력 전월 아님** — `console/revenue/page.tsx:25`. → key(YYYY-MM)로 직전 달력월 비교(대시보드 `revenueDeltaPct` 공유).
- **H4 요청함 60건 cap에 pending 묻힘** — `console.ts:361`. → pending 무제한·done만 limit 분리 조회(배지 수와 일치).
- **H5 회원관리 "담당 회원" 라벨(대표는 전체)** — `t/members/ui.tsx:50`. → `isOwner ? "전체 회원" : "담당 회원"`.
- **B3 잔여 0/만료 출석 허용** — `scheduling-actions.ts:66`. → 잔여<=0이면 차단/경고, UI 확정 비활성.
- **F2 "6월" 하드코딩** — `scheduling.ts:133` `getRecordTarget`. → `${mo}월`(아래 `getClassDetail`처럼).
- **F3 회원목록 정기일정 :30 누락** — `trainer-home.ts:301-314,426,524` `hourLabel`+minute 미select. → minute select + `hmLabel`.
- **E5 setTrainerPassword 자가 재활성** — `trainer-actions.ts:48-59` 무조건 `status:'active'`. → status 미변경, `must_change_password`만. 서버 강도검증 추가.
- **E6 출석/요청 액션 소유권 미검증** — `scheduling-actions.ts` confirmAttendance/accept/reject. → `owner || session.trainer_id===t.id` 검증(콘솔 동작 유지).
- **E7 deleteInstructor cascade로 일정/세션/출석 소실** — `trainer-actions.ts:157` member_trainers만 검사, schedules/sessions는 `on delete cascade`. → 세션/일정 있으면 hard delete 대신 영구 비활성(anonymize) 또는 삭제 전 경고.
- **J1 미수금 집계 부재** — `/t/perf`·콘솔에 미수금 총액/연체 회원 없음. → outstanding 합산 지표 + 목록(기존 `outstanding()` 재사용).
- **J2 회원 정보 수정 부재** — `updateMember` 액션 없음. 오타 전화 수정 불가. → `updateMember` + 상세 편집.
- **I2 콘솔 Card 그림자 2× / 버튼 radius 12 / 입력 12 / bg 오프토큰 / motion 300ms** — `console/ui.tsx:10,79-83`, `layout.tsx:45`, `Topbar.tsx:18`. → `shadow-card`, `rounded-[15px]`/`[13px]`, `bg-canvas`/`bg-surface`, `.tappable` 듀레이션.
- **I3 미선언 muted hex 7종** — Sidebar/Topbar/console ui. → `--color-muted-mid:#9a917f` 토큰 or 인접 `muted3`.
- **K1 2:1 읽음 단일 boolean** — 한 회원이 읽으면 상대 배지도 사라짐(`member.ts:489,566`). → 회원별 last_read.
- **K2 콘솔 로그아웃→모바일 로그인 리다이렉트** — `Sidebar.tsx:88`. → `/console`.

---

## P3 — 폴리시 / 마이너

- **K3 트레이너 홈 캘린더 이전/다음 죽은 버튼** — `t/ui.tsx:110` onPrev/onNext 미전달 + `getTrainerCalendar`가 now 고정. → 단기 chevron 숨김 / 장기 iso 반영.
- **K4 출석 결과 무시·항상 성공 토스트** — `attend/[id]/ui.tsx:106`. → `ok` 분기, 액션별 문구.
- **H6 매출건수에 환불/수동 포함** — `owner-ops.ts:637,226`. → `amount>0 && membership_id!=null`만.
- **H7 매출장부 환불 식별 불가** — `owner-ops.ts:222`. → `amount<0`이면 "환불 ·" 접두/`note` 우선.
- **H8 드릴다운 불가** — `t/perf/page.tsx:34` Metric href 없음. → Link 래핑(매출→revenue, 활성→members, 만료→retention).
- **K5 콘솔 회원선택 로딩 플래시** — `console/members/ui.tsx:61`. → `setDetail(null)`+로딩.
- **K6 매출 가리기 FOUC** — `console/privacy.tsx:16`. → SSR 쿠키 초기값/인라인 스크립트.
- **G9 회원 변경요청 중복 생성** — `member-actions.ts:120`. → 동일 session pending 존재 시 차단.
- **G10 알림 피드 페이지네이션 없음 + dedup stale** — `notifications.ts:54,14`. → 커서 페이지네이션, dedup 값변화 기준 + recipient 포함.
- **K7 "수업 24시간 전까지" 정책(12h) 불일치** — `t/class/[id]/ui.tsx:101`. → `cancelCutoffHours` 동기화.
- **K8 운동기록 회원 미열람** — `m/my/ui.tsx:168` "준비 중". → 회원 운동기록 화면.
- **I4 won() 3중복(perf판 Math.round 누락)** — → `lib/utils/format.ts` 추출.
- **I5 콘솔 loading.tsx 부재** — → 추가. + Badge/SegmentedToggle/Switch/EmptyState/rgba 보더 토큰 정리.
- **E8 회원 로그아웃 서버 무효화 아님 + 토큰 exp 없음** — E2와 함께 처리.

---

## 스코프 결정 (이번 작업)

**전부 수정**: P0 전체(A·B·D·E·F), P1 전체. P2/P3 중 버그·끊긴/가짜 플로우·일관성·실무핵심(미수금·회원수정)·UI 코히런스 일괄.

**축소 구현(설계 반영, 풀기능은 follow-up)**: 회원 로그인 레이트리밋(테이블 기반 카운터까지), 공지 백엔드(우선 가짜 숨김), 알림설정(미구현 토글 숨김), 회원권 일시정지(도메인 표준이나 enum+만료규칙 신규 — 별도), 강사별 실적/재등록률 대시보드(집계 신규 — 별도), 2:1 읽음 per-participant(스키마 변경 — 우선 카운트만 보정).

검증: `next build` + `bun test`(기존 테스트 유지/추가) + 브라우저 회귀(대표 로그인→/t·/console). 통과 후 `git push` → `bash scripts/deploy-prod.sh`.

---

## 수정 완료 (이번 배포에 포함)

P0 전부 · P1 대부분 · 다수 P2/P3 — 커밋 단위:
1. 변이 멱등성(claim-then-act): 출석/요청수락·거절 이중차감, 환불 이중지급 차단
2. 라이프사이클 백그라운드: 만료 전이 + 미래 세션 생성(maintenance.ts, /t·/console 로드 시)
3. 환불 과지급(list_unit_price 폴백) · 인증 fail-open(대표가입 부트스트랩·세션 fail-closed+exp·강사 비활성 실효화) · 회원 무차별대입(레이트리밋 0006+더미scrypt) · 임박세션 +9h
4. 만료윈도 단일기준(D--10 제거) · 활성회원권 선택 통일 · 취소요청 실제 전송
5. 결제 원자 배치 · 콘솔 focus-visible/코히런스/로그아웃
6. 시간정확성(6월/:30) · 출석결과·잔여0경고 · 알림톡 정직카피 · 라벨일관 · 매출(요청함cap/전월대비/건수/환불라벨)
7. 회원요청→선생님 알림(0007) · 중복방지 · 양도 휴대폰조회 · 강사삭제 이력보존 · 캘린더 죽은버튼 · 콘솔로딩 · 세션생성 KST 테스트

DB 마이그레이션 0006(member_login_attempts)·0007(notifications.type+request) 운영 적용 검증 완료.

## 후속 로드맵 → **2차 구현 완료** (2026-06-27 동일 세션)

아래 항목은 전부 구현·검증·배포됨. 마이그레이션 0008(회원권 정지)·0009(공지)·0010(2:1 읽음) 운영 적용 완료:
- J2 회원 정보 수정 ✓ · J1 미수금 집계 ✓ · G6 변경요청 datetime 선택 ✓
- 회원권 일시정지/재개 ✓ · G8 공지 백엔드+대표 작성 ✓ · 강사별 실적(콘솔 기존) ✓
- G7 알림설정 정직 안내 ✓ · K8 회원 비번 변경 ✓ · K6 매출가리기 FOUC 제거 ✓ · K1 2:1 참여자별 읽음 ✓
- G4(양도 슬롯 승계)는 의도적으로 "잔여만 이전" 기본 유지(이중예약 방지) — 코드 주석에 명시.

(원문 항목 목록, 기록 보존용:)

1. **회원 정보 수정(J2)** — `updateMember` 액션 + 회원 상세 편집(오타 연락처/부상메모/성별). 가장 잦은 데스크 업무.
2. **미수금 집계 뷰(J1)** — `/t/perf`·콘솔에 미수금 총액 + 연체 회원 목록(기존 `outstanding()` 합산).
3. **회원 변경요청 시간 직접선택(G6)** — `<input type="datetime-local">` 또는 선생님 가용 슬롯(현재는 +1/+3일 고정 슬롯).
4. **알림 설정 실연동(G7)** — 미구현 토글 숨김/‘준비 중’, 살아있는 2종은 회원별 설정 반영(현재 쿠키만 저장).
5. **공지 백엔드(G8)** — notices 테이블 + 대표 작성 화면(현재 하드코딩 목업).
6. **회원권 일시정지/홀딩** — `memberships.status='paused'` + 만료일 연장 규칙(부상·군입대 등 국내 표준).
7. **강사별 실적/재등록률 대시보드** — `recorded_by`/`member_trainers`/`sessions.trainer_id` 집계.
8. **2:1 채팅 참여자별 읽음(K1)** — `chat_participants.last_read_at`(현재 단일 boolean이라 한쪽이 읽으면 공유).
9. **양도 슬롯 승계(G4)** — 잔여만 이전이 기본(현 동작). 신규회원 인수 시 일정/세션 동반 이전 옵션(이중예약 주의).
10. **회원 비밀번호 변경/운동기록 열람(K8)** · 알림 피드 페이지네이션(G10) · 콘솔 매출 가리기 FOUC(K6) · muted 토큰(I3).
