-- 회원의 일정 변경/취소 요청을 담당 선생님에게 인앱 알림으로 보내기 위해 notifications.type 확장.
-- (기존 체크는 'low_sessions','expiring'만 허용 → 'request' 추가.)
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('low_sessions', 'expiring', 'request'));
