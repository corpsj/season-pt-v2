-- 강사 회당 정산: 프리랜서 강사에게 세션 유형별 회당 단가로 지급.
-- 강사별 × 세션 유형별(1on1 / 2on1) 단가(원). 정산 = 월별 attended 세션 수 × 단가.
alter table trainers add column if not exists rate_1on1 int not null default 0;
alter table trainers add column if not exists rate_2on1 int not null default 0;

-- 진행(출석 확정) 시점의 회당 단가를 세션에 스냅샷 → 이후 단가 변경이 지난달(지급 완료) 정산을 소급 변경하지 않음.
alter table sessions add column if not exists pay_rate int;
