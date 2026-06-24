-- 0004: per-weekday schedule times (minute granularity) + exercise categories.
-- Idempotent; additive.

-- schedules: store the recurring minute (0 or 30) alongside the existing hour-only column.
alter table schedules add column if not exists minute int not null default 0 check (minute in (0, 30));

-- exercises: optional category (free text; owner-managed via the exercises screen).
alter table exercises add column if not exists category text;

-- seed sensible categories onto the default exercises (only where unset).
update exercises set category = case name
  when '스쿼트'     then '하체'
  when '데드리프트' then '하체'
  when '레그프레스' then '하체'
  when '런지'       then '하체'
  when '벤치프레스' then '가슴'
  when '랫풀다운'   then '등'
  when '숄더프레스' then '어깨'
  when '플랭크'     then '코어'
  else category
end
where category is null;
