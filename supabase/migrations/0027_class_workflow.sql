-- Additive only. Apply to a test DB first; this file does not modify existing rows.
alter table sessions add column if not exists attendance_version int not null default 0;
alter table attendance_ledger add column if not exists reversed_at timestamptz;
alter table attendance_ledger add column if not exists reversed_by uuid references trainers(id) on delete set null;
alter table attendance_ledger add column if not exists reversal_reason text;

create table if not exists class_operations (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  actor_id uuid references trainers(id) on delete set null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table class_operations enable row level security;

create table if not exists class_workout_drafts (
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  exercises jsonb not null default '[]'::jsonb,
  comment text not null default '',
  version int not null default 1,
  published_version int not null default 0,
  updated_by uuid references trainers(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
);
alter table class_workout_drafts enable row level security;

create or replace function public.class_state_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at then
    new.attendance_version := old.attendance_version + 1;
  end if;
  return new;
end; $$;
drop trigger if exists class_state_version on sessions;
create trigger class_state_version before update of status, scheduled_at on sessions
for each row execute function public.class_state_version();

create or replace function public.can_manage_class(p_actor uuid, p_session uuid) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from trainers t join sessions s on s.id = p_session
    where t.id = p_actor and t.status = 'active' and not t.must_change_password
    and (t.role = 'owner' or s.trainer_id = t.id));
$$;

create or replace function public.save_class_workout_draft(
  p_session uuid, p_member uuid, p_actor uuid, p_version int, p_exercises jsonb, p_comment text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare d class_workout_drafts%rowtype;
begin
  perform id from sessions where id = p_session for update;
  if not can_manage_class(p_actor, p_session) then return jsonb_build_object('status','forbidden'); end if;
  if not exists (select 1 from session_members where session_id=p_session and member_id=p_member) then
    return jsonb_build_object('status','forbidden');
  end if;
  if p_exercises is null or jsonb_typeof(p_exercises)<>'array' or jsonb_array_length(p_exercises)>30
     or octet_length(p_exercises::text)>150000 or p_comment is null or length(p_comment)>2000 then
    return jsonb_build_object('status','invalid');
  end if;
  select * into d from class_workout_drafts where session_id=p_session and member_id=p_member for update;
  -- Lost response retry of the exact same payload is safe, without incrementing version again.
  if found and d.exercises=p_exercises and d.comment=p_comment then
    return jsonb_build_object('status','ok','version',d.version);
  end if;
  if coalesce(d.version,0)<>p_version then return jsonb_build_object('status','conflict'); end if;
  insert into class_workout_drafts(session_id,member_id,exercises,comment,version,updated_by)
  values(p_session,p_member,p_exercises,p_comment,p_version+1,p_actor)
  on conflict(session_id,member_id) do update set exercises=excluded.exercises,comment=excluded.comment,
    version=excluded.version,updated_by=p_actor,updated_at=now();
  return jsonb_build_object('status','ok','version',p_version+1);
end; $$;

create or replace function public.publish_class_workouts(
  p_session uuid, p_actor uuid, p_versions jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare d class_workout_drafts%rowtype; item record; record_id uuid;
begin
  perform id from sessions where id=p_session for update;
  if not can_manage_class(p_actor,p_session) then return jsonb_build_object('status','forbidden'); end if;
  if p_versions is null or jsonb_typeof(p_versions)<>'object' then return jsonb_build_object('status','invalid'); end if;
  -- Validate ALL versions before any write; no partly published duet records.
  for item in select key,value from jsonb_each_text(p_versions) loop
    if not exists(select 1 from session_members where session_id=p_session and member_id=item.key::uuid) then
      return jsonb_build_object('status','forbidden');
    end if;
    if coalesce((select version from class_workout_drafts where session_id=p_session and member_id=item.key::uuid),0)<>item.value::int then
      return jsonb_build_object('status','conflict');
    end if;
  end loop;
  for d in select * from class_workout_drafts where session_id=p_session and member_id::text in(select jsonb_object_keys(p_versions)) order by member_id loop
    if d.published_version=d.version then continue; end if;
    select id into record_id from workout_records where session_id=p_session and member_id=d.member_id order by created_at desc,id desc limit 1;
    if record_id is null then
      insert into workout_records(session_id,member_id,exercises,comment,created_by)
      values(p_session,d.member_id,d.exercises,nullif(d.comment,''),p_actor);
    else
      update workout_records set exercises=d.exercises,comment=nullif(d.comment,'') where id=record_id;
    end if;
    update class_workout_drafts set published_version=version where session_id=p_session and member_id=d.member_id;
  end loop;
  return jsonb_build_object('status','ok');
end; $$;

create or replace function public.class_attendance_atomic(
  p_session uuid, p_actor uuid, p_action text, p_version int, p_operation uuid,
  p_signature text default null, p_versions jsonb default null, p_allow_free boolean default false,
  p_reason text default ''
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  s sessions%rowtype; t trainers%rowtype; ms memberships%rowtype; l attendance_ledger%rowtype;
  op class_operations%rowtype; m uuid; cutoff int; noshow boolean; deduct boolean;
  before_count int; after_count int; msid uuid; result jsonb; request jsonb;
  details jsonb := '[]'::jsonb; published jsonb; policy jsonb;
begin
  select * into s from sessions where id=p_session for update;
  if not found or not can_manage_class(p_actor,p_session) then return jsonb_build_object('status','forbidden'); end if;
  request:=jsonb_build_object('action',p_action,'version',p_version,'versions',p_versions,'allowFree',p_allow_free,'reason',p_reason);
  select * into op from class_operations where id=p_operation;
  if found then
    if op.session_id<>p_session or op.actor_id<>p_actor or op.request<>request then return jsonb_build_object('status','invalid_operation'); end if;
    if (op.result->>'version')::int<>s.attendance_version then return jsonb_build_object('status','stale'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  if p_operation is null or p_version is null or p_version<>s.attendance_version then return jsonb_build_object('status','stale'); end if;
  if p_action is null or p_action not in ('attend','noshow','cancel','revert') then return jsonb_build_object('status','invalid'); end if;
  select * into t from trainers where id=s.trainer_id;
  select cancel_cutoff_hours,noshow_deducts into cutoff,noshow from studio_settings where id=1;
  cutoff:=coalesce(cutoff,0); noshow:=coalesce(noshow,true);
  policy:=jsonb_build_object('cutoffHours',cutoff,'noshowDeducts',noshow,'evaluatedAt',now(),'scheduledAt',s.scheduled_at);
  if p_action='revert' then
    if s.status='scheduled' then return jsonb_build_object('status','stale'); end if;
    if length(trim(coalesce(p_reason,'')))=0 then return jsonb_build_object('status','reason_required'); end if;
    for l in select * from attendance_ledger where session_id=p_session and reversed_at is null order by member_id,id for update loop
      if l.deducted then
        if l.membership_id is null then raise exception 'missing_original_membership'; end if;
        select * into ms from memberships where id=l.membership_id for update;
        if not found or ms.status='refunded' or ms.member_id<>l.member_id or ms.remaining_sessions>=ms.total_sessions then
          raise exception 'ineligible_restore';
        end if;
        update memberships set remaining_sessions=remaining_sessions+1 where id=ms.id;
        details:=details||jsonb_build_array(jsonb_build_object('memberId',l.member_id,'membershipId',ms.id,'remaining',ms.remaining_sessions+1));
      end if;
      update attendance_ledger set reversed_at=now(),reversed_by=p_actor,reversal_reason=p_reason where id=l.id;
    end loop;
    update sessions set status='scheduled',member_signature=null,signed_at=null,pay_rate=null where id=p_session;
  else
    if s.status<>'scheduled' then return jsonb_build_object('status','stale'); end if;
    if (s.scheduled_at at time zone 'Asia/Seoul')::date>(now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('status','future'); end if;
    if p_action='attend' and (p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature)>200000) then
      return jsonb_build_object('status','signature_required');
    end if;
    if not exists(select 1 from session_members where session_id=p_session) then return jsonb_build_object('status','no_members'); end if;
    deduct:=p_action='attend' or (p_action='noshow' and noshow) or (p_action='cancel' and cutoff>0 and s.scheduled_at-now()<make_interval(hours=>cutoff));
    for m in select member_id from session_members where session_id=p_session order by member_id loop
      -- Serialize member debits while allowing FK KEY SHARE checks in legacy cancellation.
      -- FOR UPDATE would deadlock with cancellation holding the membership row first.
      perform id from members where id=m for no key update;
      msid:=null; before_count:=null; after_count:=null;
      if deduct then
        select * into ms from memberships where member_id=m and status='active' and remaining_sessions>0
          and start_date<=(s.scheduled_at at time zone 'Asia/Seoul')::date and end_date>=(s.scheduled_at at time zone 'Asia/Seoul')::date
          order by end_date,id limit 1 for update;
        if found then
          msid:=ms.id; before_count:=ms.remaining_sessions; after_count:=before_count-1;
          update memberships set remaining_sessions=after_count where id=msid;
        elsif p_action<>'cancel' then
          if not p_allow_free or not exists(select 1 from memberships where member_id=m and status='active' and remaining_sessions=0
            and start_date<=(s.scheduled_at at time zone 'Asia/Seoul')::date and end_date>=(s.scheduled_at at time zone 'Asia/Seoul')::date) then
            raise exception 'insufficient_credit';
          end if;
        end if;
      end if;
      insert into attendance_ledger(session_id,member_id,membership_id,action,deducted,remaining_before,remaining_after,created_by)
        values(p_session,m,msid,p_action::attendance_action,msid is not null,before_count,after_count,p_actor);
      details:=details||jsonb_build_array(jsonb_build_object('memberId',m,'membershipId',msid,'remaining',after_count,'deducted',msid is not null));
    end loop;
    if p_versions is not null then
      published:=publish_class_workouts(p_session,p_actor,p_versions);
      if published->>'status'<>'ok' then raise exception 'draft_conflict'; end if;
    end if;
    update sessions set status=(case p_action when 'attend' then 'attended' when 'noshow' then 'noshow' else 'cancelled' end)::session_status,
      member_signature=case when p_action='attend' then p_signature else null end,
      signed_at=case when p_action='attend' then now() else null end,
      pay_rate=case when p_action='attend' then nullif(case when s.type='2on1' then t.rate_2on1 else t.rate_1on1 end,0) else null end
      where id=p_session;
  end if;
  update schedule_change_requests set status='rejected',resolved_at=now() where session_id=p_session and status='pending';
  select attendance_version into p_version from sessions where id=p_session;
  select coalesce(jsonb_agg(d || jsonb_build_object('totalRemaining',
    (select coalesce(sum(remaining_sessions),0) from memberships where member_id=(d->>'memberId')::uuid and status='active'
      and start_date<=(s.scheduled_at at time zone 'Asia/Seoul')::date and end_date>=(s.scheduled_at at time zone 'Asia/Seoul')::date))), '[]'::jsonb)
    into details from jsonb_array_elements(details) d;
  result:=jsonb_build_object('status','ok','version',p_version,'deductions',details,'policy',policy);
  insert into class_operations(id,session_id,actor_id,request,result) values(p_operation,p_session,p_actor,request,result);
  return result;
end; $$;

-- Service-role only; all callers must derive p_actor from the verified server context.
revoke all on function public.can_manage_class(uuid,uuid) from public, anon, authenticated;
revoke all on function public.save_class_workout_draft(uuid,uuid,uuid,int,jsonb,text) from public, anon, authenticated;
revoke all on function public.publish_class_workouts(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.class_attendance_atomic(uuid,uuid,text,int,uuid,text,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.can_manage_class(uuid,uuid) to service_role;
grant execute on function public.save_class_workout_draft(uuid,uuid,uuid,int,jsonb,text) to service_role;
grant execute on function public.publish_class_workouts(uuid,uuid,jsonb) to service_role;
grant execute on function public.class_attendance_atomic(uuid,uuid,text,int,uuid,text,jsonb,boolean,text) to service_role;

-- Compatibility: all class/request writers lock session BEFORE request.
-- Preserve 0026 request validation and receipts; no historical row cleanup here.
create or replace function public.move_session_with_tombstone_atomic(
  p_session_id uuid,
  p_expected_at timestamptz,
  p_new_at timestamptz,
  p_request_id uuid default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_request schedule_change_requests%rowtype;
  v_trainer_lock uuid;
begin
  if p_new_at is null or p_new_at <= now() then
    return 'invalid_time';
  end if;
  if p_new_at = p_expected_at then
    return 'same_time';
  end if;

  select * into v_session
  from sessions
  where id = p_session_id
  for update;

  if not found then return 'session_not_found'; end if;
  if v_session.status <> 'scheduled' then return 'session_resolved'; end if;
  if v_session.scheduled_at <> p_expected_at then return 'session_stale'; end if;

  if p_request_id is not null then
    select * into v_request
    from schedule_change_requests
    where id = p_request_id
    for update;

    if not found then return 'request_not_found'; end if;
    if v_request.status <> 'pending' then return 'request_resolved'; end if;
    if v_request.type <> 'change' or v_request.session_id <> p_session_id then
      return 'invalid_request';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements_text(v_request.proposed_slots) proposed(value)
      where proposed.value::timestamptz = p_new_at
    ) then
      return 'invalid_slot';
    end if;
  end if;

  -- 같은 강사의 모든 이동 RPC를 직렬화한 뒤 겹침을 다시 검사한다.
  select id into v_trainer_lock
  from trainers
  where id = v_session.trainer_id
  for update;

  if exists (
    select 1
    from sessions s
    where s.trainer_id = v_session.trainer_id
      and s.id <> p_session_id
      and s.status = 'scheduled'
      and s.scheduled_at > p_new_at - interval '60 minutes'
      and s.scheduled_at < p_new_at + interval '60 minutes'
  ) then
    return 'slot_conflict';
  end if;

  if v_session.source_schedule_id is not null then
    delete from sessions mark
    where mark.source_schedule_id = v_session.source_schedule_id
      and mark.scheduled_at = p_new_at
      and mark.status = 'cancelled'
      and mark.id <> p_session_id
      and not exists (
        select 1 from session_members sm where sm.session_id = mark.id
      );
  end if;

  update sessions
  set scheduled_at = p_new_at
  where id = p_session_id;

  if v_session.source_schedule_id is not null then
    insert into sessions (
      trainer_id,
      scheduled_at,
      type,
      status,
      source_schedule_id
    ) values (
      v_session.trainer_id,
      p_expected_at,
      v_session.type,
      'cancelled',
      v_session.source_schedule_id
    );
  end if;

  if p_request_id is not null then
    update schedule_change_requests
    set status = 'accepted',
        resolved_at = now(),
        accepted_slot = p_new_at
    where id = p_request_id;
  end if;

  update schedule_change_requests
  set status = 'rejected',
      resolved_at = now()
  where session_id = p_session_id
    and status = 'pending';

  return 'ok';
end;
$$;

revoke all on function public.move_session_with_tombstone_atomic(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.move_session_with_tombstone_atomic(uuid, timestamptz, timestamptz, uuid) to service_role;

-- 취소 요청 수락도 request claim, 세션 취소, 선택적 회차 차감/원장 기록을
-- 한 트랜잭션으로 끝낸다. 앱 프로세스가 중간에 종료돼도 accepted+scheduled나
-- cancelled+미차감 같은 반쪽 상태가 남지 않는다.
create or replace function public.accept_cancel_request_atomic(
  p_request_id uuid,
  p_session_id uuid,
  p_expected_at timestamptz,
  p_deduct boolean,
  p_created_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_request schedule_change_requests%rowtype;
  v_member_id uuid;
  v_membership_id uuid;
  v_before int;
  v_after int;
  v_deductions jsonb := '[]'::jsonb;
begin
  select * into v_session
  from sessions
  where id = p_session_id
  for update;

  if not found then return jsonb_build_object('status', 'session_not_found'); end if;
  if v_session.status <> 'scheduled' then return jsonb_build_object('status', 'session_resolved'); end if;
  if v_session.scheduled_at <> p_expected_at then return jsonb_build_object('status', 'session_stale'); end if;

  select * into v_request
  from schedule_change_requests
  where id = p_request_id
  for update;

  if not found then return jsonb_build_object('status', 'request_not_found'); end if;
  if v_request.status <> 'pending' then return jsonb_build_object('status', 'request_resolved'); end if;
  if v_request.type <> 'cancel' or v_request.session_id <> p_session_id then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  update sessions
  set status = 'cancelled'
  where id = p_session_id;

  if p_deduct then
    for v_member_id in
      select sm.member_id
      from session_members sm
      where sm.session_id = p_session_id
      order by sm.member_id
    loop
      v_membership_id := null;
      v_before := null;
      v_after := null;

      select ms.id, ms.remaining_sessions
      into v_membership_id, v_before
      from memberships ms
      where ms.member_id = v_member_id
        and ms.status = 'active'
        and ms.remaining_sessions > 0
      order by ms.end_date asc, ms.id asc
      limit 1
      for update;

      if v_membership_id is not null then
        v_after := greatest(0, v_before - 1);
        update memberships
        set remaining_sessions = v_after
        where id = v_membership_id;

        v_deductions := v_deductions || jsonb_build_array(jsonb_build_object(
          'membership_id', v_membership_id,
          'member_id', v_member_id,
          'remaining', v_after
        ));
      end if;

      insert into attendance_ledger (
        session_id,
        member_id,
        membership_id,
        action,
        deducted,
        remaining_before,
        remaining_after,
        created_by
      ) values (
        p_session_id,
        v_member_id,
        v_membership_id,
        'cancel',
        v_membership_id is not null,
        v_before,
        v_after,
        p_created_by
      );
    end loop;
  end if;

  update schedule_change_requests
  set status = 'accepted',
      resolved_at = now(),
      accepted_slot = null
  where id = p_request_id;

  update schedule_change_requests
  set status = 'rejected',
      resolved_at = now()
  where session_id = p_session_id
    and status = 'pending';

  return jsonb_build_object('status', 'ok', 'deductions', v_deductions);
end;
$$;

revoke all on function public.accept_cancel_request_atomic(uuid, uuid, timestamptz, boolean, uuid) from public, anon, authenticated;
grant execute on function public.accept_cancel_request_atomic(uuid, uuid, timestamptz, boolean, uuid) to service_role;

-- Supabase default ACLs explicitly grant anon/authenticated; revoke those too.
revoke all on function public.class_state_version() from public, anon, authenticated;
grant execute on function public.class_state_version() to service_role;
