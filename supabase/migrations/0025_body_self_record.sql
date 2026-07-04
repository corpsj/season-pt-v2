-- 회원 본인이 직접 기록한 체성분 마커 — 기존 행(강사 기록)은 default false로 그대로.
alter table body_compositions
  add column if not exists self_recorded boolean not null default false;
