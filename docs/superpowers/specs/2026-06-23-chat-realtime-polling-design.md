# 채팅 준실시간(폴링) 개선 설계

- 작성일: 2026-06-23
- 상태: 승인됨 (구현 대기)
- 범위: 트레이너·회원 채팅의 **실시간 수신** (열린 채팅방 + 스레드 목록 + 탭 안읽음 배지)

## 1. 배경 / 문제

현재 채팅은 텍스트 송수신, 1:1·2:1 스레드, 안읽음 카운트, 히스토리는 동작하지만
**상대가 보낸 메시지가 새로고침 전까지 보이지 않는다.** 유일한 동기화 수단이
메시지 전송 직후의 `router.refresh()` 폴링뿐이라, 채팅이 "안 되는 것처럼" 느껴진다.

목표: 열린 채팅방·스레드 목록·탭 배지가 별도 새로고침 없이 자동으로 갱신되도록 한다.

## 2. 아키텍처 제약 (방식 선택의 근거)

- **트레이너**: Supabase Auth (쿠키 JWT). `auth.uid()` 사용 가능.
- **회원**: 커스텀 서명 쿠키 세션(`MEMBER_COOKIE`, `verifySession`). **Supabase Auth 아님.**
- 모든 DB 접근은 **service-role 키**(`sb = createSupabaseAdmin()`)로 수행, 스코핑은
  코드(`getTrainerContext`/`getMemberContext`)에서 강제.
- RLS는 전 테이블 **deny-by-default**. `chat_messages`에는 SELECT 정책이 **없음**.
- 채팅 테이블이 `supabase_realtime` publication에 **포함되지 않음**.

→ Supabase Realtime `postgres_changes`는 부적합:
  회원이 브라우저에서 Supabase 세션이 없어(=anon) RLS로 식별 불가하고, 우회하려면
  `chat_messages`를 anon에 열어야 해 **전체 채팅이 외부에 노출**된다. 트레이너만 해도
  RLS 정책 신설 + publication 변경 + 회원 인증 구조 개편이 필요 → "채팅 정상화" 범위 초과.

→ **폴링 채택.** 방·목록·배지를 단일 메커니즘으로 균일 처리, DB/RLS/인증 변경 0건,
  보안 사고 위험 없음, 기존 구조와 완전 호환. 후일 회원 인증을 Supabase Auth로 옮기면
  Realtime으로 무중단 업그레이드 가능.

폴링 주기: **채팅방 3초, 스레드 목록 5초, 탭 배지 5초.** 고빈도 메신저가 아닌
트레이너-회원 PT 채팅 규모에서 체감 지연이 충분히 작다.

## 3. 컴포넌트 / 데이터 흐름

### 3.1 커서 & 중복 제거 (핵심 규약)

- `chat_messages`는 `(thread_id, created_at)` 인덱스 보유. 폴링은
  `thread_id = X AND created_at >= cursor ORDER BY created_at ASC` 로 조회.
- **커서 = 클라이언트가 보유한 마지막 메시지의 `created_at`(ISO)**. `>` 가 아니라 `>=` 를
  쓰는 이유: 동일 타임스탬프 메시지 누락 방지. 경계 메시지는 재조회되므로 클라이언트가
  **이미 알고 있는 메시지 `id` Set으로 dedupe** 한다.
- 따라서 `created_at` 원시값이 클라이언트까지 노출되어야 한다 →
  `ChatMessageView`에 `createdAt?: string` 추가.

### 3.2 데이터 레이어 (읽기 전용 서버 액션, 기존 스코핑 재사용)

`src/lib/data/groups/chat-actions.ts` (트레이너):
- `pollTrainerMessages(threadId: string, sinceISO: string | null): Promise<ChatMessageView[]>`
  - `getTrainerContext()`로 스코핑 + 스레드 소유 검증(기존 `getChatRoom` 패턴 재사용).
  - `created_at >= sinceISO`(없으면 전체)인 메시지 조회, 2:1이면 sender 라벨 채움,
    `mine = sender_type === 'trainer'`, `createdAt`/`time` 포함.
  - 수신분(`sender_type='member'`, `read_by_trainer=false`)을 read 처리 → 배지 자동 클리어.
- `sendChat`가 **생성된 메시지 행을 반환**하도록 변경:
  `{ ok: true, message: ChatMessageView }`(id, createdAt, time 포함). `router.refresh()` 의존 제거.

`src/lib/data/groups/member-actions.ts` (회원):
- `pollMemberMessages(sinceISO: string | null): Promise<ChatMessageView[]>`
  - `getMemberContext()`로 단일 스레드 해석(기존 `getMemberChatRoom` 패턴 재사용).
  - `mine = sender_type === 'member'`. 수신분(`sender_type='trainer'`) read 처리.
- `sendMemberChat`도 `{ ok: true, message: ChatMessageView }` 반환하도록 변경.

배지용 (트레이너/회원 공용):
- `pollChatUnread(): Promise<number>` — 컨텍스트 자동판별(트레이너 우선, 없으면 회원)해
  기존 `getChatUnread`/`getMemberChatUnread` 로직 재사용. `chat-actions.ts`에 배치.

타입 (`src/lib/types.ts`):
- `ChatMessageView`에 `createdAt?: string` 추가.
- `ChatRoomView`에 `cursor?: string`(마지막 메시지 created_at) 추가. `getChatRoom`/
  `getMemberChatRoom`가 채워 내려 클라이언트 초기 커서로 사용.

### 3.3 공통 폴링 훅

`src/lib/hooks/usePolling.ts` (신규):
```
usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true)
```
- mount 시 즉시 1회 실행 + `setInterval`.
- `document.visibilityState === 'hidden'` 이면 정지, `visibilitychange`로 복귀 시 즉시 1회 + 재개.
- `fn`은 최신 클로저를 보도록 ref 패턴으로 보관(interval 재생성 없이 최신 상태 참조).
- 언마운트 시 정리.

### 3.4 채팅방 (`t/chat/[id]/ui.tsx`, `m/chat/ui.tsx`)

- 초기 `messages` + 초기 `cursor`(room에서) 상태 보유. 알려진 id `Set` 유지.
- `usePolling(poll, 3000)`:
  - `poll`은 `pollTrainer/MemberMessages(threadId, cursor)` 호출.
  - 반환분 중 알려진 id가 아닌 것만 append. `mine` 메시지는 미해소 임시(temp) 메시지와
    text 매칭 시 임시를 실제 행으로 치환(중복 방지). 커서를 max(createdAt)로 전진.
  - 새 메시지 추가 시 하단 자동 스크롤.
- 송신 흐름 변경:
  - 낙관적 임시 메시지(temp id, `mine:true`, text) 추가.
  - `sendChat/sendMemberChat` 반환 행으로 임시 치환(실제 id/createdAt/time), id Set·커서 갱신.
  - **`router.refresh()` 제거.** 실패 시 임시 메시지 롤백 + 토스트.
- 폴링 틱이 송신 해소 직전에 본인 실제 메시지를 가져오는 레이스: id+text 매칭 dedupe로
  치환 처리, 최악의 경우 짧은 순간 중복 후 즉시 정리.

### 3.5 스레드 목록 (`t/chat/page.tsx`)

- 목록 렌더링을 클라이언트 컴포넌트로 추출(예: `t/chat/ChatListClient.tsx`), 초기
  `threads`를 props로 받고 `usePolling(() => pollChatThreads(), 5000)`로 행/안읽음 갱신.
- `getChatThreads`는 `chat.ts`(`import "server-only"`)에 있어 클라이언트에서 직접 호출 불가 →
  `chat-actions.ts`(`'use server'`)에 `pollChatThreads(): Promise<ChatThreadView[]>` 래퍼를
  추가해 `getChatThreads()`를 위임 호출(필수, 선택 아님).
- 회원은 단일 스레드라 목록 화면 없음 → 해당 없음.

### 3.6 탭 배지 (`TabBar.tsx`)

- `TabBar`에 옵션 prop `liveChat?: boolean` 추가.
- `true`면 `usePolling(() => pollChatUnread(), 5000)`로 안읽음 폴링, href가 `/chat`로
  끝나는 탭의 `badge`를 라이브 값으로 override. 초기값은 서버 렌더 tabs의 badge(깜빡임 없음).
- 6개 렌더 사이트(`t/ui.tsx`, `t/chat/page.tsx`, `t/members/ui.tsx`, `t/perf/page.tsx`,
  `m/ui.tsx`, `m/my/ui.tsx`)에 `liveChat` 추가.

## 4. 에러 처리

- 폴 실패: 조용히 스킵(다음 틱 재시도) + `console.warn`. UI 깨짐 없음.
- 송신 실패: 임시 메시지 롤백 + 토스트(기존 `ToastProvider` 사용).
- 컨텍스트 없음(`pollChatUnread` 등): 0/빈 배열 반환(기존 게터들과 동일 관용 동작).

## 5. 테스트 전략

`bun test` 단위 테스트:
- 커서/dedupe 로직: `created_at >= cursor` 경계 메시지가 id Set으로 중복 제거되는지.
- `mine` 판정: 트레이너/회원 각 관점에서 sender_type 매핑.
- read 처리: 폴 호출 시 수신분만 read=true 되는지(메시지 조회 로직 단위).
- `pollChatUnread` 컨텍스트 자동판별(트레이너 우선 → 회원 폴백).

수동 검증:
- 두 브라우저(트레이너/회원)로 한쪽 송신 시 다른 쪽 방·목록·배지가 ~3-5초 내 갱신.
- 백그라운드 탭 전환 시 폴링 정지, 복귀 시 즉시 갱신.
- 송신 시 본인 메시지 중복/누락 없음.

## 6. 변경 파일 요약

수정:
- `src/lib/types.ts` — `ChatMessageView.createdAt`, `ChatRoomView.cursor`.
- `src/lib/data/groups/chat.ts` — `getChatRoom`에 createdAt/cursor 채움.
- `src/lib/data/groups/member.ts` — `getMemberChatRoom`에 createdAt/cursor 채움.
- `src/lib/data/groups/chat-actions.ts` — `pollTrainerMessages`, `pollChatUnread`,
  `pollChatThreads`(클라이언트용 `getChatThreads` 래퍼), `sendChat` 반환 변경.
- `src/lib/data/groups/member-actions.ts` — `pollMemberMessages`, `sendMemberChat` 반환 변경.
- `src/app/(app)/t/chat/[id]/ui.tsx` — 폴링/낙관적 치환/`router.refresh` 제거.
- `src/app/(app)/m/chat/ui.tsx` — 동일.
- `src/app/(app)/t/chat/page.tsx` (+ 신규 `ChatListClient.tsx`) — 목록 폴링.
- `src/components/shell/TabBar.tsx` — `liveChat` prop + 배지 폴링.
- 6개 TabBar 렌더 사이트 — `liveChat` 전달.

신규:
- `src/lib/hooks/usePolling.ts`.
- `src/app/(app)/t/chat/ChatListClient.tsx` (목록 클라이언트).
- 단위 테스트 파일(들).

## 7. 범위 밖 (이번 작업 제외)

- 실시간 타이핑 표시, 첨부, 메시지 삭제/수정.
- 날짜 구분선 정상화("오늘" 하드코딩) — 별도 작업 가능, 본 작업과 독립.
- Supabase Realtime/WebSocket 전환(회원 Supabase Auth 이전 선행 필요).
