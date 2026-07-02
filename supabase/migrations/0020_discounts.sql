-- 0020_discounts.sql — 회원권 특별 할인 프리셋(가족/군경소방/노인 등).
-- 할인은 상품이 아니라 '발급 시점의 정액(원) 가격 조정'. 카탈로그를 곱하지 않는다.
-- payments.discount_label = 발급 시점의 라벨 스냅샷(FK 아님 — 프리셋이 나중에 바뀌어도 과거 기록 불변).
-- members.discount_id = 사람의 할인 자격(발급 시 자동 기본 선택, 변경 가능).
-- RLS enable(deny-by-default); 서비스롤 우회. 전부 additive(새 테이블 + nullable 컬럼) — 프로드 즉시 적용 안전.

create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount int not null check (amount > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table discounts enable row level security;

alter table payments add column if not exists discount_label text;

alter table members add column if not exists discount_id uuid references discounts(id) on delete set null;
