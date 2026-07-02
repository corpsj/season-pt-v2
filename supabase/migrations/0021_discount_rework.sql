-- 0021_discount_rework.sql — 할인 모델 정정: '정액(원) 차감' 폐기.
-- 특별할인은 별도의 '할인 가격표 상품'("특별할인 …")으로 존재하고, discounts는 자격 종류(가족·군경소방·노인 등)
-- 이름만 관리한다. 금액은 상품 가격이 담당하므로 discounts.amount 컬럼 삭제.
-- members.discount_id(자격)·payments.discount_label(자격 이름 스냅샷)은 유지. 프로드 discounts 0행이라 삭제 안전.

alter table discounts drop column if exists amount;
