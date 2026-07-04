import { fitDimensions } from "./upload-guard";

/**
 * 이미지 File을 긴 변 ≤ maxPx의 JPEG Blob으로 축소. 브라우저 전용(canvas 사용).
 * 실패 시 원본 File을 그대로 반환한다.
 */
export async function downscaleImage(file: File, maxPx = 1600, quality = 0.8): Promise<Blob> {
  try {
    // imageOrientation:"from-image" — EXIF 회전을 반영해 그린다(이미 반영하는 엔진에선 무해).
    // 옵션 백을 못 알아듣는 구형 엔진은 throw → 아래 catch가 원본을 그대로 반환.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxPx);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
    );
  } catch {
    return file; // 축소 불가 시 원본 업로드
  }
}
