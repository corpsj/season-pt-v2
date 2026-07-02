-- 0017: 동시성 백스톱 unique 인덱스 + 채팅 스레드 canonical key (실사용 감사 2차 #15/#34/#35)

-- 1) 반복 스케줄 → 세션 생성의 (스케줄, 시각) unique 백스톱(감사 #15).
--    선행 정리: 동시 생성 버그로 이미 생긴 중복 세션에서 대표 1개만 남긴다.
--    우선순위: 처리된(출석/노쇼/취소) 세션 > 출석원장 보유 > 멤버 연결 많은 것 > 먼저 생성된 것.
--    (session_members/attendance_ledger 는 on delete cascade — 잔여 링크 자동 정리)
with ranked as (
  select s.id,
         row_number() over (
           partition by s.source_schedule_id, s.scheduled_at
           order by
             (s.status <> 'scheduled') desc,
             (select count(*) from attendance_ledger al where al.session_id = s.id) desc,
             (select count(*) from session_members sm where sm.session_id = s.id) desc,
             s.created_at asc,
             s.id asc
         ) as rn
  from sessions s
  where s.source_schedule_id is not null
)
delete from sessions where id in (select id from ranked where rn > 1);

create unique index if not exists uq_sessions_schedule_slot
  on sessions (source_schedule_id, scheduled_at);
-- null source_schedule_id(수동 세션)는 NULLS DISTINCT 기본으로 제약 없음.

-- 2) 정산 인건비 이중 계상 백스톱(감사 #34): 같은 달·같은 강사의 settlement 행은 1개만.
create unique index if not exists uq_expenses_settlement
  on expenses (settle_month, trainer_id) where source = 'settlement';

-- 3) 채팅 스레드 canonical key(감사 #35): 같은 회원·강사 조합의 동시 첫 접속이
--    스레드를 이중 생성하는 check-then-create 레이스 방지. 기존 스레드는 null 유지
--    (기존 candidates 매칭 경로로 계속 동작) — 새로 만드는 스레드만 키를 갖는다.
alter table chat_threads add column if not exists canonical_key text;
create unique index if not exists uq_chat_threads_canonical
  on chat_threads (canonical_key);
