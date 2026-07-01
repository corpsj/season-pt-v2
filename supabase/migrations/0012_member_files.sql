-- 회원 첨부파일: 진행 사진 + 인바디 PDF (비공개 버킷 + 코드 레벨 권한)
create type member_file_kind as enum ('photo', 'inbody');

create table if not exists member_files (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind member_file_kind not null,
  storage_path text not null,
  note text,
  taken_at date not null default current_date,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_member_files_member on member_files(member_id, kind, taken_at desc);

-- 비공개 버킷(모든 접근은 서버 서명 URL 경유)
insert into storage.buckets (id, name, public)
values ('member-files', 'member-files', false)
on conflict (id) do nothing;
