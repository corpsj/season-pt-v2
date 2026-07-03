-- 일정 요청 열람 흔적: 상대방이 처음 열람한 시각
-- (회원 요청→강사 인박스 열람 / 강사 제안→회원 수신 화면 열람). 파생 상태 '확인함'의 소스.
alter table schedule_change_requests add column if not exists seen_at timestamptz;
