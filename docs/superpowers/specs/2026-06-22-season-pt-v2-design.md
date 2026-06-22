# season-pt_v2 — 아키텍처 설계 문서

> 작성일 2026-06-22 · 상태: 승인됨(아키텍처) · 비주얼 스펙은 [`docs/DESIGN_SPEC.md`](../../DESIGN_SPEC.md)(29화면) 참조.
> 핸드오프 원본: `docs/design-handoff/`(트레이너 앱 C안 인터랙티브 + dc-runtime + 81 아이콘 + Wanted DS 토큰).

---

## 1. 개요 · 목표

`계절 PT & 필라테스` 트레이너/회원 모바일 웹앱(PWA)을 **클로드 디자인 C안**대로 픽셀 정합하게 신규 구현한다. 기존 `season-pt`(v1) 코드는 **일절 참조·이식하지 않는다**. 환경(Supabase 서울 프로젝트, Vercel 계정, 환경변수 값, 배포 규칙)만 승계한다.

성공 기준:
- C안 29개 화면을 디자인 토큰(웜/세이지 팔레트)에 맞춰 픽셀 정합 구현.
- 트레이너(대표/강사) + 회원, 두 역할의 전체 플로우 동작.
- 운영 Supabase(서울) 위에서 실제 데이터로 동작. 새 GitHub repo·새 Vercel 프로젝트로 배포(함수 리전 `icn1`).

비목표(YAGNI): v1의 기능(체성분 일괄 import 엑셀, 푸시 reminders 크론 등)은 **디자인에 없으면 만들지 않는다**. 디자인이 진실의 원천.

---

## 2. 기술 스택 · 규약

- **Next.js 16** App Router · **React 19** · **TypeScript** · **Tailwind 4**(`@theme` CSS 변수) · **Supabase SSR**(`@supabase/ssr`).
- 패키지/로컬 런타임: **Bun**. (Vercel 빌드는 표준 Next 빌드.)
- 폰트: **Pretendard**(본문), **Cormorant Garamond**(`.serif` 수치/태그라인) — `next/font` 또는 self-host.
- 아이콘: 핸드오프 `pt-icons.js`(81개, monoline + `-fill`, `currentColor`)를 React `<Icon name size>` 단일 컴포넌트로 변환.
- 상태: 서버 우선(RSC) + 화면 상호작용은 client 컴포넌트. 전역 상태 라이브러리 미사용.
- 폼/뮤테이션: Next **Server Actions**.
- 디렉터리: `src/app`(라우트), `src/components/ui`(프리미티브), `src/components/<feature>`, `src/lib/data`(데이터 접근 + 목), `src/lib/supabase`(클라이언트), `src/lib/auth`, `src/lib/types.ts`.
- 검증 게이트(커밋/배포 전): `bunx tsc --noEmit` · `bunx eslint` · (테스트 도입 시) 테스트 · `bun run build` 통과.

---

## 3. 앱 구조 · 라우팅

모바일 단일 프레임 앱. 화면 ↔ 라우트 매핑. 인증/온보딩은 라우트 그룹 `(onboard)`, 트레이너는 `/t`, 회원은 `/m`.

**온보딩/인증**
| 라우트 | 화면 |
|---|---|
| `/` | s_start 역할 선택 |
| `/login/member` | s_loginMember |
| `/login/trainer` | s_loginTrainer |
| `/signup/owner` | s_signupOwner |
| `/login/instructor` | s_loginInstr |
| `/set-password` | s_setPw |

**트레이너 `/t` (탭: 캘린더·회원·채팅·실적[owner])**
| 라우트 | 화면 |
|---|---|
| `/t` | s_calendar |
| `/t/members` · `/t/members/[id]` | s_members · s_memberDetail |
| `/t/perf` (owner) | s_perf |
| `/t/chat` · `/t/chat/[threadId]` | s_chatList · s_chatRoom |
| `/t/settings` | s_settings |
| `/t/retention` | s_retention |
| `/t/inbox` | s_inbox |
| `/t/class/[sessionId]` · `/t/class/[sessionId]/propose` | s_classDetail · s_propose |
| `/t/attend/[sessionId]` · `/t/record/[sessionId]` | s_attend · s_record |
| `/t/confirm` | s_confirm(성공) |
| `/t/staff` · `/t/staff/invite` (owner) | s_instrManage · s_instrInvite |
| `/t/members/register` (owner) | s_memberRegister |
| `/t/members/[id]/membership` · `/t/payment` (owner) | s_issueMembership · s_paymentRecord |

**회원 `/m` (탭: 캘린더·채팅·마이)**
| 라우트 | 화면 |
|---|---|
| `/m` | s_mCalendar |
| `/m/chat` | s_mChat |
| `/m/receive` | s_mReceive |
| `/m/request` | s_mRequest |

라우트 보호: `middleware.ts`가 세션(트레이너=Supabase Auth 쿠키 / 회원=커스텀 세션 쿠키)을 확인해 `/t/*`·`/m/*` 접근 통제, owner 전용 라우트는 서버에서 role 재확인.

전환 애니메이션: 모든 화면 진입에 `.scr`(ptUp) — `prefers-reduced-motion` 시 비활성.

---

## 4. 인증 설계

두 갈래(결정 사항).

### 4.1 트레이너 = Supabase Auth (아이디 입력, 이메일 미노출)
- UI는 **아이디만** 입력. 서버에서 합성 이메일 `"<username>@trainer.seasonpt.local"`로 매핑해 `signInWithPassword` 호출.
- `trainers` 테이블: `auth_user_id`(=Supabase user), `username`(로그인 아이디, unique), `display_name`, `role`('owner'|'instructor'), `phone`, `status`('active'|'invited'), `must_change_password`(강사 임시비번 첫 로그인 강제).
- **대표 가입**: 아이디+비번 → Supabase user 생성(합성 이메일) + `trainers` row(role=owner). app_metadata에 `role`,`trainer_id` 기록(JWT 클레임).
- **강사 초대(owner)**: owner가 이름/연락처 입력 → 합성 아이디(`gyeaul.<name>`)+임시비번 발급, Supabase user + `trainers`(role=instructor, status=invited, must_change_password=true) 생성. 화면에 아이디/임시비번 표시.
- **강사 첫 로그인**: 아이디+임시비번 로그인 → `must_change_password`면 `/set-password`로 강제 → 새 비번 설정(8자+영문/숫자) → false.
- RLS: 트레이너는 자기 담당 회원/세션만. owner는 스튜디오 전체.

### 4.2 회원 = 자체 인증 (휴대폰 + 생년월일)
- 아이디=휴대폰, 초기 비번=생년월일 6자리(YYMMDD). `members.password_hash`(서버 해시; 초기엔 birthdate 기반).
- 로그인: Server Action이 휴대폰+비번 검증 → **httpOnly 서명 세션 쿠키**(JWT, 서버 시크릿 `MEMBER_SESSION_SECRET`) 발급. 만료/회전 처리.
- 회원 요청은 미들웨어/서버에서 쿠키 검증 후 **service-role 클라이언트**로 본인 데이터만 대리 조회(RLS 우회는 서버에서 member_id 스코프 강제).
- Supabase Auth user는 회원에게 만들지 않는다.

---

## 5. 데이터 모델 (신규 · 디자인 기반)

운영 Supabase(서울) 같은 프로젝트, **v2 전용 신규 스키마**. (P3에서 확정·적용. ⚠️ "기존 Supabase 완전 초기화" 결정 → §10.3 프로토콜.)

핵심 테이블(초안):

- **trainers** — id, auth_user_id, username, display_name, role('owner'|'instructor'), phone, status('active'|'invited'|'inactive'), must_change_password, created_at.
- **members** — id, name, phone(unique, 로그인 아이디), birthdate, password_hash, gender('female'|'male'|null), status('active'|'rest'|'inactive'), injury_note, created_at. (`expiring`는 membership D-day로 파생.)
- **member_trainers** — member_id, trainer_id (담당 배정; 1 회원=1 담당 기본).
- **pairs / pair_members** — 2:1 팀: pair(id, label) + pair_members(pair_id, member_id ×2). (또는 session_members 다대다로 대체 가능 — §5.1.)
- **memberships** (회원권) — id, member_id, product('10'|'20'|'30'회권), total_sessions, remaining_sessions, start_date, end_date, price(nullable), status('active'|'expired'), guided(재등록 안내 여부), created_at. D-day=end_date−today, expiring=D-day≤기준.
- **schedules** (정기수업) — id, trainer_id, type('1on1'|'2on1'), weekday(0~6), time, status. + **schedule_members**(schedule_id, member_id). 회원 등록 시 생성, 캘린더 세션의 원천.
- **sessions** (수업 인스턴스) — id, trainer_id, scheduled_at(timestamptz), type, status('scheduled'|'attended'|'noshow'|'cancelled'), source_schedule_id. + **session_members**(session_id, member_id). 1on1=1행, 2on1=2행. schedules에서 일자별 생성.
- **attendance_ledger** (출석·차감 이력) — id, session_id, member_id, action('attend'|'noshow'|'cancel'), deducted(bool), remaining_before, remaining_after, created_by, created_at. (정정도 이력 기록.)
- **workout_records** (운동기록) — id, session_id, member_id, exercises(jsonb: [{name,kg,sets}]), comment, created_by, created_at.
- **body_compositions** (체성분) — id, member_id, weight, skeletal_muscle, body_fat, measured_at.
- **schedule_change_requests** (일정 조율) — id, session_id, requester_type('trainer'|'member'), requester_id, type('change'|'cancel'), status('pending'|'accepted'|'rejected'), reason, original_at, proposed_slots(jsonb, ≤3), resolved_at, created_at. 인박스 받은/보낸은 requester/대상으로 질의.
- **payments** (결제 기록) — id, membership_id, method('cash'|'card'|'account'), amount(nullable), paid_at, recorded_by, created_at.
- **chat_threads** — id, trainer_id, type('1on1'|'2on1'), last_message, last_at, updated_at. + **chat_participants**(thread_id, member_id ×1~2). + **chat_messages**(id, thread_id, sender_type('trainer'|'member'), sender_id, text, created_at, read_by_trainer, read_by_member).

### 5.1 2:1 팀 모델 결정
`session_members`/`schedule_members`/`chat_participants` 조인 테이블로 1~2 회원을 연결한다(별도 pairs 테이블 없이). 2:1 세션 출석/차감은 양쪽 member의 membership에서 각각 1회 차감("함께 차감"). 이게 가장 단순하고 디자인의 "팀=함께 처리" 의미와 일치.

### 5.2 파생/계산 값
실적(매출 기여·수업수·출석률·주간분포), 만료임박 수, D-day, 잔여, 진행% 등은 쿼리/뷰/RPC로 계산. 매출/가격 노출은 §11 정책 메모 참조(디자인엔 존재).

---

## 6. 디자인 시스템 구현

`DESIGN_SPEC.md` §A/§B가 권위. 인라인 hex/px가 최종 진실.

- **토큰**: `src/app/globals.css`에 Tailwind 4 `@theme`로 컬러(40여종 시맨틱 명명), 라운드, 그림자, 폰트 변수 정의. 예: `--color-sage:#768C6A`, `--color-ink:#4B3B2E`, `--color-canvas:#EAE5DB`, `--color-surface:#FAF8F4`, `--color-terracotta:#C67352` … (스펙 §A.1 전체).
- **키프레임**: ptUp/ptPop/ptGrow/ptPulse/toastIn → globals.css. 공통 transition 유틸.
- **폰트**: Pretendard + Cormorant Garamond(`.serif`).
- **아이콘**: `pt-icons.js` → `src/components/ui/icon.tsx`(name union 타입 81개, size prop, currentColor). 빌드 스크립트로 자동 변환.
- **프리미티브**(`src/components/ui/`): `Frame`,`Screen`,`StatusBar`,`HomeIndicator`,`Card`,`PrimaryButton`,`OutlineButton`,`Chip`,`Avatar`,`TeamAvatar`,`TabBar`,`BackButton`,`Kicker`,`Badge`(변형 매트릭스 §B),`Banner`(중립/경고/강조/2:1/대표),`Stepper`,`SegmentedToggle`,`RadioOption`,`Checkbox`,`CalendarGrid`,`BarChart`,`StatCard`,`EmptyState`,`Toast`,`ChatBubble`,`ChatInput`,`Field`(입력). 각 프리미티브는 스펙 수치를 정확히 반영하고 단독 테스트/프리뷰 가능하게.
- **프레임 셸**: 데스크톱 미리보기에선 380×812 프레임으로 감싸고, 실제 모바일/PWA에선 풀스크린(safe-area). 레이아웃 컴포넌트로 분기.

---

## 7. 데이터 접근 계층 (UI 우선 → 배선 교체)

- `src/lib/types.ts`: §5 모델의 TypeScript 타입(Member, Trainer, Session, Membership, ChangeRequest, ChatThread, …).
- `src/lib/data/`: 화면이 호출하는 **리포지토리 인터페이스**(예 `getTrainerCalendar(date)`, `getMembers(filter)`, `getMemberDetail(id)`, `getInbox()`, `getChatThreads()` …). 반환 타입은 `types.ts`.
- **P1/P2(UI 우선)**: 위 함수들을 `DESIGN_SPEC.md` 부록 시드 데이터(회원 5·요청 3·강사 4·종목 등)로 채운 **mock 구현**으로 제공. 화면은 mock로 완성.
- **P3(배선)**: 동일 시그니처를 Supabase 쿼리/Server Action 구현으로 교체. 화면 코드는 거의 불변. (인터페이스 경계가 교체 지점.)

---

## 8. 빌드 단계 (UI 우선)

- **P0 기반**: 토큰→Tailwind 테마, 폰트, 아이콘 변환, 프리미티브 카탈로그, mock 데이터+타입, 프레임 셸, `/dev` 프리뷰 페이지. 검증 게이트 통과.
- **P1 트레이너 앱**: 온보딩/인증 화면(UI) + 캘린더·회원·회원상세·실적·출석·운동기록·재등록·수업상세·변경제안·인박스·확정·설정·강사관리/초대·회원등록·회원권발급·결제기록·채팅목록/방. (mock 기준)
- **P2 회원 앱**: 회원 캘린더·변경요청 수신·변경/취소 요청·채팅. (mock 기준)
- **P3 백엔드 배선**: Supabase 신규 스키마(마이그레이션) → ⚠️백업+리셋 확인(§10.3) → 적용. 트레이너 Supabase Auth + 회원 커스텀 세션. 리포지토리 mock→실데이터 교체. RLS·서버액션.
- **P4 마감**: PWA(manifest·아이콘·서비스워커·"홈 화면에 추가"), 접근성, reduced-motion, 에러/로딩 상태, 빈 상태.
- **P5 배포**: 새 GitHub repo `season-pt-v2` → 새 Vercel 프로젝트, env 승계, `vercel.json` `regions:["icn1"]`, 스모크+리전 검증.

각 단계 끝에서 검증 게이트(§2) 통과 + 스크린샷 정합 확인.

---

## 9. 검증 · 테스트

- 타입/린트/빌드 게이트(§2).
- 프리미티브: `/dev` 카탈로그 페이지에서 시각 확인 + (도입 시) 컴포넌트 단위 테스트.
- 화면 정합: `DESIGN_SPEC.md` 스펙치(hex/px) 대비 구현 대조. 핸드오프 스크린샷과 육안 정합.
- 플로우: 트레이너(대표/강사)·회원 각 핵심 경로 수동 검증(로그인→캘린더→출석/차감→기록, 일정 조율 송수신→확정, 회원등록→회원권발급→결제, 채팅).
- 배포 후: `/`→`/`(role select) 200, 로그인 200, `/t`·`/m` 보호 동작, `x-vercel-id: icn1::icn1` 확인.

---

## 10. 배포 · 환경 승계

### 10.1 환경변수(값 승계)
v1 `.env.local`의 Supabase URL/anon/service-role, VAPID(푸시 도입 시), 그리고 v2 신규 `MEMBER_SESSION_SECRET`, `TRAINER_EMAIL_DOMAIN`. v1 `.env.deploy.local`의 `VERCEL_TOKEN`/`VERCEL_SCOPE`/`SUPABASE_DB_URL`(배포 스크립트용).

### 10.2 Vercel
- 새 Vercel 프로젝트(새 repo 연결). `vercel.json`: `{"regions":["icn1"]}`(+ 필요한 크론). 함수 리전 서울 고정(Supabase 코로케이션) — 미설정 시 TTFB 퇴행.
- 배포는 outward-facing → **오너 명시 지시 시에만**. 배포 스크립트는 v1 패턴(직접 업로드) 승계하되 새 프로젝트용으로 재작성.

### 10.3 ⚠️ Supabase 초기화 프로토콜 (파괴적)
"기존 Supabase 완전 초기화" 결정. 이는 **라이브 `season-pt.vercel.app`의 데이터를 영구 삭제**한다. P3 진입 시:
1. 먼저 전체 스키마+데이터 **백업 덤프**(`pg_dump`/Supabase backup) 보관.
2. 오너에게 영향(라이브 v1 다운)·백업 위치를 고지하고 **명시적 재확인**.
3. 확인 후에만 초기화 → v2 신규 마이그레이션 적용.
지금(P0~P2)은 운영 DB를 건드리지 않는다.

---

## 11. 범위 외 · 리스크 · 메모

- **매출/가격 노출 정책**: v1엔 "돈 미추적(가격 null·매출 기능 제거)" 결정 이력이 있으나, **v2 디자인(오너가 직접 설계)엔 실적·결제·회원권 가격이 존재**한다. 디자인을 권위로 보고 구현하되, 가격을 실제 수집/노출할지는 P2~P3에서 오너 최종 확인(필요 시 nullable로 두고 비노출 토글). 
- 회원 앱은 디자인상 캘린더·일정조율·채팅 중심(잔여/진행만 노출). v1의 회원 진행/목표/공지 화면은 디자인에 없으므로 범위 외.
- 2:1 팀, 일정 조율 송수신·확정, 출석 차감 멱등성, 채팅 미읽음 동기화가 로직 난도 높은 지점.
- PWA 오프라인은 최소(앱 셸 캐시)만; 실시간 채팅은 polling 또는 Supabase Realtime(P3 결정).

---

## 부록 — 화면↔라우트↔데이터 한눈 요약
29화면 전체 명세는 `docs/DESIGN_SPEC.md` §C, 내비 그래프는 §D, 화면별 데이터는 §E 참조.
