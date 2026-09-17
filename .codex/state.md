# Codex State

## Active Task

남은 완성도 개선을 끝까지 구현·검증한다. 단, 강사 최초 로그인은 사용자가 요청한 대로 임시 비밀번호를 추가하지 않고 기존 전화번호 단독 로그인 방식을 유지한다.

## Current Phase

complete

## Changes Made

- 강사 최초 로그인 방식은 그대로 유지하고, 전화번호 로그인으로 만들어진 설정 전 세션은 `/set-password` 외 운영 Server Action을 호출하지 못하도록 setup/operational trainer context를 분리했다.
- inactive 회원의 신규 로그인과 기존 서명 쿠키 접근을 모두 차단하고 `/m`, `/t` 전체 라우트 가드를 추가했다.
- 유지보수 API를 `CRON_SECRET` 누락 시 503, 잘못된 인증 시 401로 fail-closed 처리하고 배포 env 설정 실패도 즉시 중단하도록 했다.
- 미래 일정/출석 서버 검증, 출석 서명 검증, exact request 확인 화면, 회원 달력 1:1/2:1 표기를 보강했다.
- `0026_schedule_request_integrity.sql`에 세션당 pending 요청 unique 백스톱, `accepted_slot`, 이동/tombstone/request 원자 RPC, 취소/request/차감/ledger 원자 RPC를 추가했다.
- 404 및 앱/콘솔/global error boundary, 운영 `/dev` 404 가드를 추가했다.
- ConfirmDialog focus trap/Escape/focus restore, 44px 터치 타깃, focus-visible, reduced motion, ARIA current/pressed/progress/switch/calendar semantics를 보강했다.

## Commands Run

- `git status --short --branch`
- `git diff --check`
- `bun run lint`
- `bun test`
- `bunx tsc --noEmit --incremental false`
- `bun run build`
- `bash -n scripts/setup-deploy.sh scripts/deploy-prod.sh`
- PostgreSQL 15 임시 컨테이너에서 0001/0016/0017 핵심/0023/0026 migration 적용
- 임시 DB에서 change 이동, conflict rollback, source tombstone 왕복, cancel+deduction+ledger RPC 시나리오 실행
- production `next start` + `curl` 상태 확인
- 인앱 브라우저 DOM/a11y snapshot 및 screenshot QA

## Validation Output

- ESLint: 통과, 경고 없음
- Bun tests: 72/72 통과, 162 assertions
- TypeScript: 전체 검사 통과
- Next.js 16.2.9 production build: compile/typecheck/static generation 58/58 통과
- Shell syntax: 통과
- Diff check: 통과
- PostgreSQL migration: 함수/권한/partial unique 생성 통과
- RPC scenario: 이동 `ok`, conflict 시 session/request 원복 유지, tombstone 왕복 `ok`, 취소 시 잔여 5→4 및 ledger 생성 확인
- HTTP: `/dev` 404, `/login/instructor` 200, 없는 주소 404
- 독립 리뷰: 기능/무결성 및 UI 재검토에서 새 P0/P1 없음

## Visual QA

- 390×844 production 강사 최초 로그인: 전화번호 필드만 표시, 임시 비밀번호 입력 없음, 고정 CTA/텍스트/간격 정상.
- 390×844 404: 중앙 empty state와 하단 CTA가 safe area 안에 보이며 클리핑 없음.
- 1440×900 콘솔 로그인: 중앙 카드, 대비, 필드/버튼 정렬 정상.
- 700×900 dev catalog: 44px 달력 셀, 컨트롤, segmented toggle, radio option의 간격/정렬 정상.
- DOM 접근성 snapshot: 날짜별 전체 이름, selected/pressed, 탭 current, 그룹 이름, 진행률/스위치 이름 확인.
- 근거: `.codex/qa/completeness-2026-07-10/` 아래 `final-*` PNG.

## Current Failures

- 없음.

## Pro Review Cycles

0

## Last Pro Verdict

unavailable

## Applied Pro Feedback

- 외부 GPT Pro 리뷰는 실행하지 않았다. 대신 두 독립 sub-agent의 무결성/UI 리뷰에서 나온 P1/P2를 구현 후 재검토했다.

## Skipped Pro Feedback

- 없음.

## Remaining Risks

- 전화번호만 아는 사람이 최초 로그인할 수 있는 본질적 위험은 사용자 요구에 따라 유지된다. 설정 전 운영 액션 차단으로 권한 범위는 줄였지만 최초 본인 확인 강도 자체는 바뀌지 않았다.
- 운영 배포 시 코드보다 `supabase/migrations/0026_schedule_request_integrity.sql`을 반드시 먼저 적용해야 한다.
- 운영 Supabase와 실제 로그인 계정으로 authenticated 화면을 변이하는 E2E는 수행하지 않았다. RPC는 격리된 PostgreSQL 15에서 검증했다.

## Next Step

배포할 때 `bash scripts/deploy-prod.sh supabase/migrations/0026_schedule_request_integrity.sql`로 migration-first 순서를 지킨다.
