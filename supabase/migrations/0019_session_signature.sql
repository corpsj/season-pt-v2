-- 수업 완료 회원 확인 서명(분쟁 방지): 출석 처리 시 회원이 강사 기기에 직접 서명.
-- member_signature = 작은 PNG data URL(수 KB). 되돌리기/보상 복구 시 함께 초기화된다.
alter table sessions add column if not exists member_signature text;
alter table sessions add column if not exists signed_at timestamptz;
