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

/** 발급 픽커 자동 필터: 담당이 대표면 대표+공용, 강사면 강사+공용 상품만 노출. */
export function tierMatches(name: string, trainerIsOwner: boolean): boolean {
  const tier = productTier(name);
  return tier === "common" || tier === (trainerIsOwner ? "owner" : "staff");
}

/** 폼 조합용 상품명: "대표 1:1 PT 10회권" (공용은 무접두). */
export function composeProductName(tier: ProductTier, type: "1on1" | "2on1", sessions: number): string {
  const prefix = tier === "owner" ? "대표 " : tier === "staff" ? "강사 " : "";
  return `${prefix}${type === "2on1" ? "2:1" : "1:1"} PT ${sessions}회권`;
}
