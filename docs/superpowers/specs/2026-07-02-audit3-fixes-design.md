# 3차 실사용 감사 백로그 수정 — 설계

날짜: 2026-07-02 · 상태: 승인됨
근거: 3차 실사용 감사(멀티에이전트 + 적대적 검증, 원시 64건 → 확정 24건). 백로그 원본은 프로젝트 메모리 `audit3-real-usage-remaining.md`.

## 범위

확정 24건 중 **웹푸시를 제외한 23건**. 웹푸시(핵심 3종: 채팅 수신 / 일정 요청·확정·거절 / 만료·잔여 임박)는 신규 인프라(구독 테이블·VAPID·SW push 핸들러)라 **별도 스펙 2**로 분리 — 본 스펙 배포 후 착수.

확정된 제품 결정:
- **회원 비밀번호는 생년월일 6자리로 고정** — 변경 기능 자체를 제거한다.
- 웹푸시 수신자는 회원 + 강사/대표 모두.

## 페이즈 1 · 계정/비밀번호

1. **회원 비번 변경 기능 제거**: `changeMemberPassword`(`src/lib/auth/member-actions.ts:76-84`) 액션과 `/m/my`(`src/app/(app)/m/my/ui.tsx`)의 변경 모달 삭제. 로그인 화면(숫자 6자리 입력)은 그대로 유지 — 입력/검증 불일치 문제가 기능 제거로 소멸.
2. **생년월일 수정 = 비번 초기화**: `updateMember`(`owner-ops-actions.ts:150-172`)가 `birthdate`를 변경하면 `password_hash`를 `hashPassword(YYMMDD)`로 재해시하고 해당 전화번호의 `member_login_attempts` 행을 삭제(잠금 해제). 이것이 대표측 회원 비번 초기화 수단을 겸한다.
3. **강사 비번 리셋**: 대표 전용 `resetInstructorPassword(trainerId)` 액션 — `inviteInstructor`(`trainer-actions.ts:96-103`)의 임시비번 생성 로직 재사용, `admin.auth.admin.updateUserById(auth_user_id, {password: temp})` + `must_change_password=true`. 임시비번은 반환값으로 대표 화면에 1회 표시. 버튼 위치: `/t/staff/[id]` + `/console/trainers` 패널.
4. **대표 계정 최후 복구**: `scripts/reset-trainer-password.ts` — service-role로 username을 받아 `updateUserById` 실행. `.env.deploy.local` 자격 증명 사용, 사용법은 스크립트 헤더 주석에 명시. (강사 인증 이메일이 가짜 도메인이라 이메일 리셋 불가 — 서버 밖 스크립트가 유일한 최후 수단)

## 페이즈 2 · 환불

5. **마이그레이션 `0018_refund_flex.sql`**:
   - `membership_events`에 `meta jsonb` 추가(환불 직전 상태 스냅샷용).
   - `payments`에 `payer_member_id uuid references members(id)` 추가, 기존 행은 현 소유 회원권의 `member_id`로 백필(페이즈 4의 양도 문제 해결용).
6. **협의 금액**: `refundMembership`(`membership-actions.ts:94+`)에 `amountOverride?: number`(0 이상 정수 서버 검증) + `note?: string` 추가. `previewRefund` 산식 결과는 기본값·참고치로 유지. 콘솔(`console/members/ui.tsx` 환불 모달)과 모바일(`MembershipActions.tsx`) 양쪽 확인 단계에 **금액 입력 필드**(기본값=산식 결과)와 **환불 수단 선택** 추가(모바일 `method:"account"` 하드코딩 제거).
7. **이관 회원권 0원 확정 차단**: `previewRefund`가 `paidSum=0`(결제 기록 없는 이관 회원권)이면 `noBaseline: true` 플래그 반환 → UI가 금액 직접 입력을 필수화하고 자동 확정을 막는다.
8. **환불 취소**: `refundMembership`이 refund 이벤트의 `meta`에 `{prev_status, prev_remaining, prev_end_date}` 저장. 대표 전용 `undoRefund(membershipId)` 액션 — 환불 음수 결제행 삭제 + `meta` 스냅샷으로 memberships 복원 + refund 이벤트에 취소 표시(또는 `undo_refund` 이벤트 추가). 정기 스케줄은 자동 재활성화하지 않음 — 성공 토스트에 "필요 시 스케줄을 다시 켜세요" 안내.
9. **콘솔 환불 미리보기 실패 분기**: `openRefund`(`console/members/ui.tsx:96-104`)에 `!p.ok` 분기 — "계산 중…" 대신 에러 메시지 + 직접 입력 유도.

## 페이즈 3 · 회원권 상태 표시 + 출석 가드

10. **회원 화면에서 paused/expired 표시**: `member.ts`의 `activeMembership`(74-96)을 `status in ("active","paused")`로 확장(만료 임박 정렬 유지). active/paused가 없으면 가장 최근 `expired` 회원권을 폴백으로 반환. `/m` 홈 잔여 배지와 `/m/my` 카드에 '일시정지 중'/'만료됨' 배지 — "이용 중인 회원권이 없어요"는 회원권 이력이 정말 없을 때만.
11. **무회원권 출석 가드**: `confirmAttendance`에서 attend/noshow인데 활성 회원권이 없으면(`ms=null`) 명시 에러 반환("활성 회원권이 없어요 — 재등록/재개를 먼저 확인하세요"). ledger `deducted`에는 정책값이 아닌 실제 차감 여부를 기록. cancel은 기존 동작 유지.

## 페이즈 4 · 나머지 medium/low

12. **콘솔 발급 금액**: 발급/신규등록 모달에 금액 입력(기본값 상품 정가) → `consoleIssueMembership`이 `recordPayment`에 `amount` 전달.
13. **알림설정 라벨 정합**: `t/settings/notifications` 라벨을 실동작으로 교체(notifSession→"잔여 회차 임박(3회 이하)", notifExpiry→"만료 임박(D-7)"), 발송 로직이 안 읽는 항목(결제 등)은 '준비 중' 처리.
14. **양도 결제내역**: `getMemberPayments`를 `payer_member_id` 기준 조회로 전환 — 결제 기록이 원 결제자에게 남고, 인수자 화면·누적 합계에서 제외.
15. **옛 스레드 unread**: `getMemberChatUnread`(`member.ts:567-589`)를 canonical 스레드(`ensureChatThread` 결과) 기준으로만 계산.
16. **캘린더 배지**: `mapDayClass`(`trainer-home.ts:250-257`) badge 분기에 `noshow→'노쇼'`, `cancelled→'취소'` 추가.
17. **propose 유연화**: `/t/class/[id]/propose`에 날짜+시간 직접 선택(`input type="date"/"time"`) 1행 추가해 슬롯 목록에 합류. 사유 칩 '직접 입력' 선택 시 텍스트 필드 노출(리터럴 "직접 입력" 전송 제거).
18. **PWA 복귀 갱신**: `visibilitychange`(visible 전환) 시 `router.refresh()` 하는 클라이언트 컴포넌트 1개(60초 스로틀), `(app)` 레이아웃에 마운트. 1시간 만료 signed URL·어제 데이터 문제 해소.
19. **로드 상한**: 채팅 메시지 최근 100건, 식단·진행사진 최근 60건 `.limit()` + '더보기'(offset 추가 로드). 잘리는 경우에만 더보기 버튼 노출.
20. **세션 슬라이딩**: 미들웨어에서 `spt_member` 검증 후 만료 7일 이내면 쿠키 재서명(30일 연장). 하드 만료로 인한 조용한 먹통 해소.
21. **파괴적 액션 confirm**: 식단 삭제(`m/my/meals/ui.tsx:181`)와 회원권 연장(`MembershipActions.tsx:34`)에 기존 `ConfirmDialog` 재사용.
22. **출석 재시도 문구**: `confirmAttendance` 실패 시 "이미 처리됐거나 담당 수업이 아니에요"를 분리 판정 — 세션 status로 "이미 처리된 수업이에요" vs 소유권으로 "담당 수업이 아니에요".

## 검증

- 순수 계산 변화(환불 override·noBaseline 판정)는 `bun test` 케이스 추가(`refund.test.ts` 확장).
- 전체: `bunx tsc --noEmit` + `bun run build`.
- 배포 전 수동 검증: 강사 비번 리셋 → 임시비번 로그인, 환불 override → undo 왕복, paused 회원권 회원 화면, 무회원권 출석 에러.
- 에러 처리·UI 피드백은 기존 `Result{ok,error}` + 토스트 패턴 그대로.

## 배포

페이즈 완료 시마다 커밋, 전체 완료 후 `git push origin main` → `bash scripts/deploy-prod.sh` (마이그레이션 0018은 배포 전 Bun.SQL로 적용).

## 스펙 2 예고 (웹푸시 — 별도 설계)

핵심 3종 이벤트를 인앱 notifications 생성 지점에서 푸시로 미러링. 구독 테이블 + VAPID + `sw.js` push/notificationclick 핸들러 + 발송 헬퍼 1개. 본 스펙 배포 후 별도 브레인스토밍으로 설계.
