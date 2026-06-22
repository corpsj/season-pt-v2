-- season-pt_v2 — foundation schema (fresh, design-derived). Authority: docs/superpowers/specs §5.
-- Applied to the (reset) Supabase project in P3 AFTER a backup dump. Idempotent-ish: run on a clean DB.
-- RLS is enabled on every table (deny-by-default). Data access is mediated server-side via the
-- service-role key, which bypasses RLS; the server enforces trainer/owner/member scoping.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type trainer_role as enum ('owner','instructor');
  create type trainer_status as enum ('active','invited','inactive');
  create type member_status as enum ('active','rest','inactive');
  create type gender_t as enum ('female','male');
  create type session_type as enum ('1on1','2on1');
  create type session_status as enum ('scheduled','attended','noshow','cancelled');
  create type attendance_action as enum ('attend','noshow','cancel');
  create type request_type as enum ('change','cancel');
  create type request_status as enum ('pending','accepted','rejected');
  create type actor_type as enum ('trainer','member');
  create type payment_method as enum ('cash','card','account');
  create type membership_status as enum ('active','expired');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- core
create table if not exists trainers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  role trainer_role not null default 'instructor',
  phone text,
  status trainer_status not null default 'active',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,
  birthdate date not null,
  password_hash text not null,
  gender gender_t,
  status member_status not null default 'active',
  injury_note text,
  avatar_tone text not null default 'sage',
  created_at timestamptz not null default now()
);

create table if not exists member_trainers (
  member_id uuid references members(id) on delete cascade,
  trainer_id uuid references trainers(id) on delete cascade,
  primary key (member_id, trainer_id)
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  product text not null,
  total_sessions int not null,
  remaining_sessions int not null,
  start_date date not null,
  end_date date not null,
  price int,
  status membership_status not null default 'active',
  guided boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_memberships_member on memberships(member_id);

-- ---------------------------------------------------------------- scheduling
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  type session_type not null default '1on1',
  weekday int not null check (weekday between 0 and 6),
  hour int not null check (hour between 0 and 23),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists schedule_members (
  schedule_id uuid references schedules(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  primary key (schedule_id, member_id)
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  scheduled_at timestamptz not null,
  type session_type not null default '1on1',
  status session_status not null default 'scheduled',
  source_schedule_id uuid references schedules(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_trainer_time on sessions(trainer_id, scheduled_at);
create table if not exists session_members (
  session_id uuid references sessions(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  primary key (session_id, member_id)
);

-- ---------------------------------------------------------------- records
create table if not exists attendance_ledger (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  action attendance_action not null,
  deducted boolean not null default false,
  remaining_before int,
  remaining_after int,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);

create table if not exists workout_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete set null,
  member_id uuid not null references members(id) on delete cascade,
  exercises jsonb not null default '[]'::jsonb,
  comment text,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);

create table if not exists body_compositions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  weight numeric,
  skeletal_muscle numeric,
  body_fat numeric,
  measured_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- requests / payments
create table if not exists schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  requester_type actor_type not null,
  requester_id uuid not null,
  type request_type not null,
  status request_status not null default 'pending',
  reason text,
  original_at timestamptz,
  proposed_slots jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_requests_status on schedule_change_requests(status);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  method payment_method not null,
  amount int,
  paid_at date not null default current_date,
  recorded_by uuid references trainers(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- chat
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainers(id) on delete cascade,
  type session_type not null default '1on1',
  last_message text,
  last_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists chat_participants (
  thread_id uuid references chat_threads(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  primary key (thread_id, member_id)
);
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_type actor_type not null,
  sender_id uuid not null,
  text text not null,
  read_by_trainer boolean not null default false,
  read_by_member boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_thread_time on chat_messages(thread_id, created_at);

-- ---------------------------------------------------------------- RLS (deny-by-default; service-role bypasses)
do $$
declare t text;
begin
  foreach t in array array[
    'trainers','members','member_trainers','memberships','schedules','schedule_members',
    'sessions','session_members','attendance_ledger','workout_records','body_compositions',
    'schedule_change_requests','payments','chat_threads','chat_participants','chat_messages'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- A trainer may read their own trainers row (Supabase Auth path); owner reads all.
create policy trainers_self_read on trainers for select to authenticated
  using (auth_user_id = auth.uid()
         or exists (select 1 from trainers o where o.auth_user_id = auth.uid() and o.role = 'owner'));
