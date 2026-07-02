-- 감사3: 환불 유연화 + 결제자 스냅샷
-- 1) 환불 직전 상태 스냅샷/undo 표시용
alter table membership_events add column if not exists meta jsonb;

-- 2) 결제 당시의 결제자(양도 시 결제 내역이 인수자에게 넘어가던 문제)
alter table payments add column if not exists payer_member_id uuid references members(id) on delete set null;
update payments p set payer_member_id = m.member_id
  from memberships m
  where p.membership_id = m.id and p.payer_member_id is null;
create index if not exists idx_payments_payer on payments(payer_member_id);
