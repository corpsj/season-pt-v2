-- 회원권 일시정지/홀딩(부상·군입대·장기출장 등 국내 PT 표준). 정지 중엔 차감·만료 동결,
-- 재개 시 정지 기간만큼 만료일 연장.
alter type membership_status add value if not exists 'paused';
alter table memberships add column if not exists paused_at timestamptz;

-- 이력에 pause/resume 기록 허용(기존 체크는 issue/extend/refund/transfer만).
alter table membership_events drop constraint if exists membership_events_type_check;
alter table membership_events add constraint membership_events_type_check
  check (type in ('issue', 'extend', 'refund', 'transfer', 'pause', 'resume'));
