// 회원권 상품 분류 — 별도 컬럼 없이 상품명 규칙을 단일 소스로 쓴다(등록·콘솔에서 이미 검증된 관례).
// 담당: 이름에 "대표"/"강사" 포함(없으면 공용 — 기존 상품 하위 호환). 유형: "1:1"/"2:1" 포함.
// 규칙은 설정 화면의 상품 폼이 이름을 토글 조합으로 '생성'해서 강제한다(타이핑 오타 원천 차단).

export type ProductTier = "owner" | "staff" | "common";

export function productTier(name: string): ProductTier {
  if (name.includes("대표")) return "owner";
  if (name.includes("강사")) return "staff";
  return "common";
}

export function productType(name: string): "1on1" | "2on1" | null {
  if (name.includes("2:1")) return "2on1";
  if (name.includes("1:1")) return "1on1";
  return null;
}

/** 특별할인 상품 여부: 이름에 "특별할인" 포함 — 자체 할인 가격표를 가진 별도 상품(금액 차감 아님). */
export function isDiscountProduct(name: string): boolean {
  return name.includes("특별할인");
}

export type PickerFilter = "1on1" | "2on1" | "discount";

/** 발급 픽커 3분류 필터: 특별할인 칩은 특별할인 상품만, 1:1/2:1 칩은 일반 상품 중 해당 유형.
 *  유형 표기 없는 상품(기존 커스텀 이름)은 1:1/2:1 어느 칩에서도 노출 — 숨은 상품이 생기지 않게. */
export function matchesPickerFilter(name: string, filter: PickerFilter): boolean {
  if (filter === "discount") return isDiscountProduct(name);
  if (isDiscountProduct(name)) return false;
  const t = productType(name);
  return t === null || t === filter;
}

/** 폼 조합용 상품명: "대표 1:1 PT 10회권" (공용은 무접두). 할인이면 "특별할인 "을 최전방에 접두("특별할인 강사 1:1 PT 10회권"). */
export function composeProductName(tier: ProductTier, type: "1on1" | "2on1", sessions: number, discount?: boolean): string {
  const prefix = tier === "owner" ? "대표 " : tier === "staff" ? "강사 " : "";
  return `${discount ? "특별할인 " : ""}${prefix}${type === "2on1" ? "2:1" : "1:1"} PT ${sessions}회권`;
}
