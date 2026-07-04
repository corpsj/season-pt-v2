export type FileKind = "photo" | "inbody";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/** (w,h)를 종횡비 유지한 채 긴 변이 max 이하가 되도록 축소. 이미 작으면 그대로. */
export function fitDimensions(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** 저장 가능한(=확장자·contentType가 확정되는) 이미지 MIME. */
export const UPLOADABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** 다운스케일 결과(또는 폴백된 원본)가 저장 가능한 이미지 타입인지 — iPhone HEIC 등 차단. */
export function isUploadableImage(type: string): boolean {
  return (UPLOADABLE_IMAGE_TYPES as readonly string[]).includes(type);
}

/** 저장소에 닿기 전 업로드 검증. 순수 함수 — 서버·클라이언트 공용. */
export function validateUpload(
  kind: FileKind,
  mime: string,
  size: number,
): { ok: true } | { ok: false; error: string } {
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: "파일이 너무 커요 (최대 10MB)" };
  // SVG는 이미지지만 스크립트를 품을 수 있어 차단 — 회원이 올린 활성 SVG를 강사가 새 탭으로 열면 실행됨(감사 #41).
  if (kind === "photo" && (mime === "image/svg+xml" || !mime.startsWith("image/")))
    return { ok: false, error: "사진 파일(JPG·PNG 등)만 올릴 수 있어요" };
  if (kind === "inbody" && mime !== "application/pdf") return { ok: false, error: "PDF 파일만 올릴 수 있어요" };
  return { ok: true };
}
