-- 식단 관리: 회원이 식단(사진·메모)을 기록 → 강사가 피드백.
-- 사진은 기존 비공개 버킷 member-files 재사용(경로 {memberId}/meal/{id}.jpg), 서버 서명 URL로만 노출.
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  photo_path text,                 -- 비공개 버킷 내 경로 (메모만 기록 시 null)
  memo text,                       -- 무엇을 먹었는지
  meal_type text,                  -- '아침'|'점심'|'저녁'|'간식' (선택)
  eaten_at timestamptz not null default now(),
  feedback text,                   -- 강사 피드백 (null이면 미응답)
  feedback_by uuid references trainers(id),
  feedback_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_meal_logs_member on meal_logs(member_id, eaten_at desc);
