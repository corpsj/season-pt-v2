-- 회원 로그인 무차별 대입 방어: 휴대폰별 실패 카운터 + 잠금. (회원은 Supabase Auth가 아니라
-- 커스텀 로그인이라 자체 레이트리밋이 필요.) 부가 방어막 — 코드는 테이블 부재 시 fail-open.
create table if not exists member_login_attempts (
  phone text primary key,
  fail_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table member_login_attempts enable row level security; -- service-role만 접근(딥-바이-디폴트)
