# season-pt_v2 — 회원(Member) 관점 전수 감사 & 수정 계획

작성일: 2026-06-27 · 브랜치: `membership-lifecycle`
방법: 회원 surface(`/m/*` + `member.ts`/`member-actions.ts`/`auth/member-actions.ts`/`notifications.ts`/`chat.ts`) 전수 정독 + **실제 회원 로그인 라이브 워크스루**(윤채원 01044010005/920217 — 캘린더·요청·receive·채팅·마이·결제·공지·알림설정·피드 클릭스루, 콘솔 무에러 확인). 모든 findings는 실제 코드 file:line + 화면으로 검증.

선행: 같은 브랜치에서 **대표(owner) 관점** 감사(`2026-06-27-owner-app-audit.md`)로 돈/라이프사이클/인증 신뢰성은 이미 대거 수정됨. 본 문서는 그와 겹치지 않는 **회원이 직접 보고 만지는 화면**의 결함만 다룬다.

핵심 결론: 회원 화면은 시각적으로 완성도가 높고 런타임 콘솔도 깨끗하나, **(1) 가짜/죽은 affordance(준비중 토스트에 네비 chevron, 하드코딩 아바타·날짜칩), (2) 컨텍스트를 잃은 액션(변경 버튼이 탭한 수업이 아닌 "다음 수업"을 타깃), (3) 빈/엣지 상태 미처리(공지 EmptyState 없음, 만료 회원권 홈 배지 D--N), (4) 환불 결제내역 오표기**가 남아 "버그 없는 실사용" 기준엔 못 미친다.

---

## P0 — 회원이 즉시 마주치는 깨짐/오인

### M-1 · 홈 캘린더 배지 만료/무회원권 미처리
- `src/app/(app)/m/ui.tsx:42-44` 배지 `잔여 {remaining} · D-{dDay}`. `member.ts:152-153` `dDay = membership ? dayDiff(today, end_date) : 0`.
- 만료 회원권이 아직 `expired`로 스윕되기 전(스윕은 대표/콘솔 로드시만 best-effort) 회원이 먼저 로그인 → `dDay<0` → **"D--3"**. 무회원권 → **"잔여 0 · D-0"**.
- 마이페이지 카드(`member.ts:771` `expired` + "만료")는 처리하나 홈 배지는 불일치.
- **수정**: 서버에서 만료/플로어 처리한 라벨 + `hasMembership` 반환. 회원권 없으면 배지 숨김(또는 "회원권 없음"), 만료면 "만료".

### M-4 · 결제·구매 내역 환불 표시 오류
- `member.ts:798-853` `getMemberPayments`는 회원권의 **모든** payments(환불 음수행 포함)를 그대로 노출. 환불은 `membership_id`를 유지(`membership-actions.ts:106`).
- 결과(환불 이력 있는 회원): ① 환불 음수행이 `won(-162000)="-162,000원"` + statusLabel "사용완료", ② 환불된 회원권의 **원결제도** "사용완료"(status≠active), ③ `note`("환불: …") 미노출, ④ "전체 결제 N건"에 환불행 포함, ⑤ paused 회원권 결제도 "사용완료" 오표기.
- **수정**: `amount<0` → "환불"(부호/톤), refunded 회원권 양수행 → "환불됨", paused → "일시정지". 건수는 양수행만. 누적금액은 net 유지(환불 반영).

### M-11 · "변경" 버튼이 탭한 수업이 아닌 "다음 수업"을 타깃
- `m/ui.tsx:84` 날짜 카드 `<Link href="/m/request">` 정적 + `member.ts:351-364` `getMemberRequest`는 무조건 nearest upcoming session.
- 라이브 확정: **6/26(금) 카드의 변경 → 7/1(수) 수업** 요청 화면. 과거 수업(6/26<오늘27) 카드에도 변경 노출.
- **수정**: 링크에 세션 id 전달(`/m/request?s=<id>`), `getMemberRequest(sessionId?)`가 소유·미래 검증 후 해당 세션 사용(없으면 nearest fallback). 과거 세션 카드는 변경 버튼 숨김. receive "다른 시간 제안"도 요청 세션 id 전달.

---

## P1 — 가짜/죽은 화면·요소 (회원에 "깨진" 느낌)

### M-2 · receive 트레이너 아바타 "계" 하드코딩
- `m/receive/ui.tsx:60` `<Avatar initial="계" />` — 트레이너가 정호진인데 "계". `view.trainerName` 있음.
- **수정**: `view.trainerName` 첫 글자 사용.

### M-3 · 채팅 날짜칩 "오늘" 하드코딩
- `m/chat/ui.tsx:104-105` 모든 메시지를 단일 "오늘" 칩 아래 렌더. 라이브 확정: 8PM→9PM→12PM(정오)→6AM 메시지가 전부 "오늘"(명백히 다른 날).
- `ChatMessageView.createdAt` 존재.
- **수정**: KST 날짜별 그룹 + 날짜 구분칩(오늘/어제/M월 D일).

### M-12 · 공지사항 빈 화면 + 죽은 "지난 공지 더보기"
- `m/my/notices/ui.tsx` 활성 공지 0건 시 **빈 카드**(EmptyState 없음). "지난 공지 더보기"는 토스트 "준비 중". (알림 피드 `feed/ui.tsx:78`는 EmptyState 정상 → 불일치)
- 데모 스튜디오에 공지 시드 자체가 없음.
- **수정**: 0건 → EmptyState. "지난 공지 더보기"는 limit 미달이면 숨김(가짜 토스트 제거). 데모용 공지 2–3건 시드.

### M-5 · "운동 기록" 죽은 메뉴 (데이터는 존재)
- `m/my/ui.tsx:187` chevron 달린 행이 토스트 "준비 중". 그러나 `workout_records`(name/kg/sets jsonb + comment + created_at)에 트레이너가 기록한 데이터가 쌓임(`scheduling-actions.ts:107`).
- **수정**: `getMemberWorkoutRecords` getter + `/m/my/records` 읽기전용 화면(세션 날짜별 운동·중량·세트 + 선생님 코멘트). 메뉴 행을 실제 라우팅으로.

### M-6 · 알림 설정 위약 토글
- `member.ts:627-650` 7개 토글 중 5개(예약확정·리마인더·출석차감·이벤트·야간) 미연동. 살아있는 2개(만료·잔여)도 생성기(`notifications.ts`)는 `studio_settings`만 보고 **회원 토글은 무시**. 쿠키 저장은 효과 없음.
- **수정(정직)**: 실제 동작하는 항목만 노출하고, 나머지는 "준비 중" 명시(또는 숨김). 배너 카피를 실제 상태와 일치시킴. (per-member 실연동은 background 스캔이 회원 요청 밖이라 DB 스키마 필요 → 본 작업선 정직 노출로 마감, 풀연동은 follow-up.)

---

## P2 — 데드 affordance / 실무 / 마이너

- **M-7 프로필 편집 가짜 pencil** — `m/my/ui.tsx:90-97` 토스트 "준비 중". 회원 정보는 대표 관리 모델 → 거짓 affordance. **수정**: pencil 제거(또는 비노출).
- **M-8 이용약관·정책 죽은 행** — `m/my/ui.tsx:197` 토스트 "준비 중". **수정**: 정적 약관/정책 읽기 화면 `/m/my/policy` 추가 후 라우팅(스튜디오 취소정책 + 기본 약관 안내).
- **M-10 앱 버전 하드코딩 "2.4.1"** — `m/my/ui.tsx:210` (package.json 0.1.0과 무관한 가짜). **수정**: 단일 상수화(`APP_VERSION`).
- 재등록(`ui.tsx:127`)·회원탈퇴(`ui.tsx:205`) 토스트="선생님 문의" — 휴먼 라우팅으로 허용. chevron 오인만 경미(유지).

---

## P3 — 정리 / 잠재

- **M-9 데드코드** — `getMemberRequest.slots`/`getMemberRequestMeta`/proposal 계산(`member.ts:383-426`)은 datetime-local 전환 후 미사용. 삭제.
- **M-13** — 채팅 `sub` prop 미사용(`m/chat/ui.tsx:26`); `getMemberChatRoom` 전체 메시지 무제한 로드(`member.ts:481` no limit) — 저볼륨이라 OK, defer(주석).
- 트레이너 제안 슬롯 과거 허용(시드 아티팩트) + `acceptMemberChange` 미래검증 부재 — 트레이너 주도라 경미, defer.

---

## 운영 검증 중 추가 발견 (배포 후 스모크 테스트)

### M-14 · 트레이너 변경요청 배너가 "현재 월"로 스코프됨
- `member.ts` `getMemberCalendar`의 `hasTrainerReq`가 **월-필터된 세션**(`rows`)만 조회 → 트레이너가 다른 달(예: 7월) 세션 변경을 요청하면 6월을 보는 회원에게 배너가 **안 뜸**. 회원의 유일한 행동 신호인데 누락.
- **수정**: 월 무관 **전체 세션**(`sm`)으로 pending 트레이너 요청 조회. `/m/receive`(getMemberReceive)는 이미 전역이라 일관성 확보. (운영에서 재현 → 수정 → 재배포 확인.)

## 스코프 (이번 작업)

**전부 수정**: P0(M-1·M-4·M-11), P1(M-2·M-3·M-5·M-6·M-12), P2(M-7·M-8·M-10), P3(M-9). 데모 공지 시드 추가.
**Defer(명시)**: M-6 per-member 알림 실연동(스키마), M-13 채팅 페이지네이션, 제안슬롯 미래검증.

검증: `next build` + `bun test`(기존 유지/추가) + 회원 라이브 회귀(로그인→캘린더/변경/receive/채팅/마이/결제/운동기록/공지/알림설정/약관). 통과 후 `git push origin main` → `bash scripts/deploy-prod.sh`.
