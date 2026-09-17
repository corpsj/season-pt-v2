-- 0026: 일정 요청 확정값 보존 + 세션당 pending 요청 동시성 백스톱

-- 선택지가 여러 개여도 실제 수락한 시각을 영수증에 그대로 보존한다.
alter table schedule_change_requests
  add column if not exists accepted_slot timestamptz;

-- 과거 레이스로 한 세션에 pending이 여러 개면 가장 최근 요청만 남긴 뒤
-- partial unique index를 만든다. 이후 동시 제안/역제안도 DB가 한 건만 허용한다.
with ranked as (
  select id,
         row_number() over (
           partition by session_id
           order by created_at desc, id desc
         ) as rn
  from schedule_change_requests
  where status = 'pending'
)
update schedule_change_requests r
set status = 'rejected',
    resolved_at = coalesce(r.resolved_at, now())
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists uq_schedule_change_requests_pending_session
  on schedule_change_requests (session_id)
  where status = 'pending';

-- 세션 이동, 빈 tombstone 회수, 원래 슬롯 tombstone 생성, 요청 확정을 한
-- 트랜잭션으로 묶는다. trainer 행 잠금으로 서로 다른 두 세션이 동시에 같은
-- 강사의 겹치는 시각으로 이동하는 TOCTOU도 직렬화한다.
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

  select * into v_session
  from sessions
  where id = p_session_id
  for update;

  if not found then return 'session_not_found'; end if;
  if v_session.status <> 'scheduled' then return 'session_resolved'; end if;
  if v_session.scheduled_at <> p_expected_at then return 'session_stale'; end if;

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

revoke all on function public.move_session_with_tombstone_atomic(uuid, timestamptz, timestamptz, uuid) from public;
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
  select * into v_request
  from schedule_change_requests
  where id = p_request_id
  for update;

  if not found then return jsonb_build_object('status', 'request_not_found'); end if;
  if v_request.status <> 'pending' then return jsonb_build_object('status', 'request_resolved'); end if;
  if v_request.type <> 'cancel' or v_request.session_id <> p_session_id then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select * into v_session
  from sessions
  where id = p_session_id
  for update;

  if not found then return jsonb_build_object('status', 'session_not_found'); end if;
  if v_session.status <> 'scheduled' then return jsonb_build_object('status', 'session_resolved'); end if;
  if v_session.scheduled_at <> p_expected_at then return jsonb_build_object('status', 'session_stale'); end if;

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

revoke all on function public.accept_cancel_request_atomic(uuid, uuid, timestamptz, boolean, uuid) from public;
grant execute on function public.accept_cancel_request_atomic(uuid, uuid, timestamptz, boolean, uuid) to service_role;
