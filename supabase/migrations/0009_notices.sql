-- 공지사항: 대표가 작성·게시, 회원 앱에 노출(하드코딩 목업 대체).
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  tag text not null default '운영',
  tone text not null default 'ops' check (tone in ('important', 'ops', 'facility')),
  title text not null,
  body text,
  active boolean not null default true,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_notices_active on notices(active, created_at desc);
alter table notices enable row level security; -- service-role만(딥-바이-디폴트)
