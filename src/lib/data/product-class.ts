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

/** 발급·설정 화면의 4분류 탭: 담당(대표/강사) × 유형(1:1/2:1). 특별할인 상품도 자기 tier×type 탭에 배지로 함께 노출. */
export type Quad = "owner-1on1" | "staff-1on1" | "owner-2on1" | "staff-2on1";
export const QUAD_TABS: { key: Quad; tier: "owner" | "staff"; type: "1on1" | "2on1"; label: string }[] = [
  { key: "owner-1on1", tier: "owner", type: "1on1", label: "대표 1:1" },
  { key: "owner-2on1", tier: "owner", type: "2on1", label: "대표 2:1" },
  { key: "staff-1on1", tier: "staff", type: "1on1", label: "강사 1:1" },
  { key: "staff-2on1", tier: "staff", type: "2on1", label: "강사 2:1" },
];

/** 상품명의 담당·유형이 탭과 일치하는가. */
export function matchesQuad(name: string, tab: { tier: "owner" | "staff"; type: "1on1" | "2on1" }): boolean {
  return productTier(name) === tab.tier && productType(name) === tab.type;
}

/** 4탭 어디에도 안 맞는 상품(무표기 공용/무유형 — 기존 커스텀 이름). 픽커 하단 "기타"로 노출해 숨김 방지. */
export function isUnclassified(name: string): boolean {
  return productTier(name) === "common" || productType(name) === null;
}

/** 등록이 2명으로 확장되는지: 2:1 상품이면 듀엣. */
export function isDuetProduct(name: string): boolean {
  return productType(name) === "2on1";
}

/** 탭·픽커용 짧은 라벨: 유형 있는 상품은 "16회권"(대표/1:1 맥락은 탭이 제공), 없으면 전체 이름. */
export function productShortLabel(p: { name: string; sessions: number }): string {
  return productType(p.name) ? `${p.sessions}회권` : p.name;
}

/** 폼 조합용 상품명: "대표 1:1 10회권" (공용은 무접두). 할인이면 "특별할인 "을 최전방에 접두("특별할인 강사 1:1 10회권"). */
export function composeProductName(tier: ProductTier, type: "1on1" | "2on1", sessions: number, discount?: boolean): string {
  const prefix = tier === "owner" ? "대표 " : tier === "staff" ? "강사 " : "";
  return `${discount ? "특별할인 " : ""}${prefix}${type === "2on1" ? "2:1" : "1:1"} ${sessions}회권`;
}
