-- 회원권 라이프사이클: 환불 상태, 정상가, 이력/알림 테이블, 8/16/24 상품(대표/강사), 차감 12h.
alter type membership_status add value if not exists 'refunded';

-- 1회 정상가(비할인, 환불 차감용): 상품에 기본값, 회원권에 발급 시점 스냅샷
alter table membership_products add column if not exists unit_list_price int not null default 0;
alter table memberships add column if not exists list_unit_price int;

-- 회원권 이력(연장·양도·환불 등 payments에 안 남는 동작)
create table if not exists membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  type text not null check (type in ('issue','extend','refund','transfer')),
  amount int,
  note text,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_membership_events_ms on membership_events(membership_id);

-- 알림(인앱 우선, channel=확장 seam)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type actor_type not null,
  recipient_id uuid not null,
  type text not null check (type in ('low_sessions','expiring')),
  title text not null,
  body text,
  membership_id uuid references memberships(id) on delete cascade,
  channel text not null default 'in_app',
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_recipient on notifications(recipient_type, recipient_id, status);
alter table membership_events enable row level security;
alter table notifications enable row level security;

-- 기존 10/20/30 상품 비활성화(과거 회원권 참조 보존)
update membership_products set active = false where sessions in (10, 20, 30);

-- 8/16/24 × 대표/강사 6종 (가격·정상가 TBD=0, 대표가 상품화면에서 채움). 이름으로 idempotent.
insert into membership_products (name, sessions, price, duration_days, unit_list_price, sort_order, active)
select * from (values
  ('8회권 (대표)',  8,  0, 30, 0, 1, true),
  ('8회권 (강사)',  8,  0, 30, 0, 2, true),
  ('16회권 (대표)', 16, 0, 60, 0, 3, true),
  ('16회권 (강사)', 16, 0, 60, 0, 4, true),
  ('24회권 (대표)', 24, 0, 90, 0, 5, true),
  ('24회권 (강사)', 24, 0, 90, 0, 6, true)
) as v(name, sessions, price, duration_days, unit_list_price, sort_order, active)
where not exists (select 1 from membership_products mp where mp.name = v.name);

-- 차감 정책: 취소 12시간 기준(기존 0=항상 미차감일 때만 설정, 대표 변경 보존)
update studio_settings set cancel_cutoff_hours = 12 where id = 1 and cancel_cutoff_hours = 0;
