-- Revenue ledger: allow manual / past revenue rows that aren't tied to a membership
-- (so the Excel history + misc income can live in `payments`, reusing all revenue sums).
alter table payments alter column membership_id drop not null;
alter table payments add column if not exists note text;
