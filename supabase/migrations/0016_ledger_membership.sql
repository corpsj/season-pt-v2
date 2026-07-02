-- 출석/취소 차감이 어느 회원권에서 빠졌는지 원장에 기록.
-- 되돌리기(정정) 시 '차감된 그 회원권'에 정확히 1회 복원하기 위함(감사 후속: revertAttendance가
-- 만료 임박 회원권을 잘못 골라 유령 회차/회차 유실을 일으키던 문제 해소). 기존 행은 NULL 허용.
alter table attendance_ledger
  add column if not exists membership_id uuid references memberships(id) on delete set null;
