-- 0003_ops.sql — owner ops: product catalog, studio settings, exercise catalog.
-- RLS enabled (deny-by-default); service-role bypasses. Idempotent.

create table if not exists membership_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sessions int not null,
  price int not null,
  duration_days int not null default 90,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into membership_products (name, sessions, price, duration_days, sort_order)
select * from (values
  ('1:1 PT 10회권', 10, 750000, 90, 1),
  ('1:1 PT 20회권', 20, 1400000, 90, 2),
  ('1:1 PT 30회권', 30, 1980000, 90, 3)
) as v(name, sessions, price, duration_days, sort_order)
where not exists (select 1 from membership_products);

create table if not exists studio_settings (
  id int primary key default 1 check (id = 1),
  noshow_deducts boolean not null default true,
  cancel_cutoff_hours int not null default 0,
  notif_expiry boolean not null default true,
  notif_session boolean not null default true,
  notif_payment boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into studio_settings (id) values (1) on conflict (id) do nothing;

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into exercises (name, sort_order)
select * from (values
  ('스쿼트',1),('데드리프트',2),('벤치프레스',3),('레그프레스',4),
  ('랫풀다운',5),('숄더프레스',6),('런지',7),('플랭크',8)
) as v(name, sort_order)
where not exists (select 1 from exercises);

alter table memberships add column if not exists product_id uuid references membership_products(id);

alter table membership_products enable row level security;
alter table studio_settings enable row level security;
alter table exercises enable row level security;
