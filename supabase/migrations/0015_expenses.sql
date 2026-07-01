-- 매장 지출(손익) 장부: 나간 돈을 6개 분류로 기록해 월 순이익 완성. payments(매출)와 완전 분리.
-- category: labor 인건비·rent 임대료·utility 공과금·marketing 마케팅·supply 소모품·장비·etc 기타. RLS on(deny-by-default), service-role만.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('labor','rent','utility','marketing','supply','etc')),
  amount int not null check (amount > 0),
  spent_at date not null,                     -- 지출 발생일(KST, 앱이 todayISO 주입)
  note text,
  trainer_id uuid references trainers(id) on delete set null,  -- 인건비 귀속(옵션)
  source text not null default 'manual' check (source in ('manual','settlement','incentive')),
  settle_month text,                          -- 'YYYY-MM' 정산 출처 대상 월(정산행만)
  recorded_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
alter table expenses enable row level security;  -- service-role만(deny-by-default)

create index if not exists idx_expenses_settle on expenses (settle_month, source);
create index if not exists idx_expenses_spent_at on expenses (spent_at);
