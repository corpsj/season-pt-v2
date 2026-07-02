import { test, expect } from "bun:test";
import { productTier, productType, tierMatches, composeProductName, isDiscountProduct } from "./product-class";

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

test("tierMatches: 담당 기반 자동 필터 (공용은 항상 노출)", () => {
  expect(tierMatches("대표 1:1 PT 10회권", true)).toBe(true);
  expect(tierMatches("대표 1:1 PT 10회권", false)).toBe(false);
  expect(tierMatches("강사 1:1 PT 10회권", false)).toBe(true);
  expect(tierMatches("강사 1:1 PT 10회권", true)).toBe(false);
  expect(tierMatches("1:1 PT 10회권", true)).toBe(true);
  expect(tierMatches("1:1 PT 10회권", false)).toBe(true);
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
