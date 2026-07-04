import { test, expect } from "bun:test";
import {
  productTier,
  productType,
  matchesQuad,
  isUnclassified,
  isDuetProduct,
  productShortLabel,
  composeProductName,
  isDiscountProduct,
  QUAD_TABS,
} from "./product-class";

test("productTier: 대표/강사/공용 분류", () => {
  expect(productTier("대표 1:1 10회권")).toBe("owner");
  expect(productTier("강사 2:1 20회권")).toBe("staff");
  expect(productTier("1:1 10회권")).toBe("common"); // 무표기 = 기존 상품 하위 호환
  expect(productTier("여름 이벤트 5회권")).toBe("common");
});

test("productType: 1:1/2:1/기타", () => {
  expect(productType("대표 1:1 10회권")).toBe("1on1");
  expect(productType("2:1 20회권")).toBe("2on1");
  expect(productType("이벤트 5회권")).toBeNull();
});

test("matchesQuad: 담당×유형 4분류 탭", () => {
  const owner1 = QUAD_TABS.find((t) => t.key === "owner-1on1")!;
  const staff2 = QUAD_TABS.find((t) => t.key === "staff-2on1")!;
  expect(matchesQuad("대표 1:1 8회권", owner1)).toBe(true);
  expect(matchesQuad("강사 1:1 8회권", owner1)).toBe(false); // 담당 다름
  expect(matchesQuad("대표 2:1 8회권", owner1)).toBe(false); // 유형 다름
  expect(matchesQuad("강사 2:1 8회권", staff2)).toBe(true);
  // 특별할인 상품도 자기 tier×type 탭에 노출(배지로 구분)
  expect(matchesQuad("특별할인 강사 2:1 8회권", staff2)).toBe(true);
  // 무표기/무유형 상품은 어느 탭에도 안 맞음
  expect(matchesQuad("여름 이벤트 5회권", owner1)).toBe(false);
});

test("isUnclassified: 무표기 공용/무유형 상품", () => {
  expect(isUnclassified("여름 이벤트 5회권")).toBe(true); // 담당·유형 둘 다 없음
  expect(isUnclassified("1:1 10회권")).toBe(true); // 담당 없음(공용)
  expect(isUnclassified("대표 1:1 8회권")).toBe(false);
  expect(isUnclassified("강사 2:1 8회권")).toBe(false);
});

test("isDuetProduct: 2:1 상품이면 듀엣(2명 등록)", () => {
  expect(isDuetProduct("강사 2:1 8회권")).toBe(true);
  expect(isDuetProduct("대표 1:1 8회권")).toBe(false);
  expect(isDuetProduct("여름 이벤트 5회권")).toBe(false);
});

test("productShortLabel: 유형 있으면 회차만, 없으면 전체 이름", () => {
  expect(productShortLabel({ name: "대표 1:1 16회권", sessions: 16 })).toBe("16회권");
  expect(productShortLabel({ name: "강사 2:1 8회권", sessions: 8 })).toBe("8회권");
  expect(productShortLabel({ name: "여름 이벤트 5회권", sessions: 5 })).toBe("여름 이벤트 5회권");
});

test("composeProductName: 토글 조합 → 규칙 준수 이름", () => {
  expect(composeProductName("owner", "1on1", 10)).toBe("대표 1:1 10회권");
  expect(composeProductName("staff", "2on1", 20)).toBe("강사 2:1 20회권");
  expect(composeProductName("common", "1on1", 30)).toBe("1:1 30회권");
});

test("isDiscountProduct: 특별할인 접두 감지", () => {
  expect(isDiscountProduct("특별할인 1:1 10회권")).toBe(true);
  expect(isDiscountProduct("특별할인 강사 1:1 10회권")).toBe(true);
  expect(isDiscountProduct("1:1 10회권")).toBe(false);
  expect(isDiscountProduct("대표 2:1 20회권")).toBe(false);
});

test("composeProductName: 특별할인 접두(4번째 인자)", () => {
  expect(composeProductName("common", "1on1", 10, true)).toBe("특별할인 1:1 10회권");
  expect(composeProductName("staff", "1on1", 10, true)).toBe("특별할인 강사 1:1 10회권");
  expect(composeProductName("owner", "2on1", 20, false)).toBe("대표 2:1 20회권");
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
