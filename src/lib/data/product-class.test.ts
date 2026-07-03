import { test, expect } from "bun:test";
import { productTier, productType, matchesPickerFilter, composeProductName, isDiscountProduct } from "./product-class";

test("productTier: 대표/강사/공용 분류", () => {
  expect(productTier("대표 1:1 PT 10회권")).toBe("owner");
  expect(productTier("강사 2:1 PT 20회권")).toBe("staff");
  expect(productTier("1:1 PT 10회권")).toBe("common"); // 무표기 = 기존 상품 하위 호환
  expect(productTier("여름 이벤트 5회권")).toBe("common");
});

test("productType: 1:1/2:1/기타", () => {
  expect(productType("대표 1:1 PT 10회권")).toBe("1on1");
  expect(productType("2:1 PT 20회권")).toBe("2on1");
  expect(productType("이벤트 5회권")).toBeNull();
});

test("matchesPickerFilter: 1:1/2:1/특별할인 3분류", () => {
  expect(matchesPickerFilter("대표 1:1 PT 10회권", "1on1")).toBe(true);
  expect(matchesPickerFilter("대표 1:1 PT 10회권", "2on1")).toBe(false);
  expect(matchesPickerFilter("강사 2:1 PT 20회권", "2on1")).toBe(true);
  expect(matchesPickerFilter("특별할인 1:1 PT 10회권", "discount")).toBe(true);
  expect(matchesPickerFilter("특별할인 1:1 PT 10회권", "1on1")).toBe(false); // 특별할인은 전용 칩에서만
  expect(matchesPickerFilter("1:1 PT 10회권", "discount")).toBe(false);
  // 유형 표기 없는 커스텀 상품은 1:1/2:1 어디서든 노출
  expect(matchesPickerFilter("여름 이벤트 5회권", "1on1")).toBe(true);
  expect(matchesPickerFilter("여름 이벤트 5회권", "2on1")).toBe(true);
});

test("composeProductName: 토글 조합 → 규칙 준수 이름", () => {
  expect(composeProductName("owner", "1on1", 10)).toBe("대표 1:1 PT 10회권");
  expect(composeProductName("staff", "2on1", 20)).toBe("강사 2:1 PT 20회권");
  expect(composeProductName("common", "1on1", 30)).toBe("1:1 PT 30회권");
});

test("isDiscountProduct: 특별할인 접두 감지", () => {
  expect(isDiscountProduct("특별할인 1:1 PT 10회권")).toBe(true);
  expect(isDiscountProduct("특별할인 강사 1:1 PT 10회권")).toBe(true);
  expect(isDiscountProduct("1:1 PT 10회권")).toBe(false);
  expect(isDiscountProduct("대표 2:1 PT 20회권")).toBe(false);
});

test("composeProductName: 특별할인 접두(4번째 인자)", () => {
  expect(composeProductName("common", "1on1", 10, true)).toBe("특별할인 1:1 PT 10회권");
  expect(composeProductName("staff", "1on1", 10, true)).toBe("특별할인 강사 1:1 PT 10회권");
  expect(composeProductName("owner", "2on1", 20, false)).toBe("대표 2:1 PT 20회권");
});

test("compose → parse 왕복 일치", () => {
  const name = composeProductName("staff", "2on1", 15);
  expect(productTier(name)).toBe("staff");
  expect(productType(name)).toBe("2on1");
});

test("compose(특별할인) → parse 왕복 일치 (담당·유형 유지)", () => {
  const name = composeProductName("staff", "1on1", 10, true);
  expect(isDiscountProduct(name)).toBe(true);
  expect(productTier(name)).toBe("staff");
  expect(productType(name)).toBe("1on1");
});
