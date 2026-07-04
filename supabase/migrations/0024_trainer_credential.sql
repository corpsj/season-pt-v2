-- 강사/대표 계정 비밀번호를 대표가 나중에 다시 조회할 수 있도록 암호화 저장.
-- Supabase Auth(auth.users)는 단방향 해시라 복구 불가 — 콘솔 조회용으로 별도 컬럼에 AES-256-GCM 암호문만 저장.
alter table trainers add column if not exists credential_enc text;
