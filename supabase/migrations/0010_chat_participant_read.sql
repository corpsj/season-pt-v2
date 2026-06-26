-- 2:1 팀 채팅 참여자별 읽음 추적. 기존 chat_messages.read_by_member(메시지당 단일 boolean)는
-- 한 회원이 읽으면 상대 배지도 사라지는 문제 → 참여자별 last_read_at로 분리.
alter table chat_participants add column if not exists last_read_at timestamptz;
