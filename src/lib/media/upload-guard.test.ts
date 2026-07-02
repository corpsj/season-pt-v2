import { test, expect } from "bun:test";
import { fitDimensions, validateUpload, MAX_UPLOAD_BYTES } from "./upload-guard";

test("fitDimensions: 작은 이미지는 그대로", () => {
  expect(fitDimensions(800, 600, 1600)).toEqual({ w: 800, h: 600 });
});
test("fitDimensions: 가로가 긴 이미지는 긴 변 기준 축소", () => {
  expect(fitDimensions(3200, 2400, 1600)).toEqual({ w: 1600, h: 1200 });
});
test("fitDimensions: 세로가 긴 이미지는 긴 변 기준 축소", () => {
  expect(fitDimensions(2400, 3200, 1600)).toEqual({ w: 1200, h: 1600 });
});
test("validateUpload: 용량 초과 거부", () => {
  expect(validateUpload("photo", "image/jpeg", MAX_UPLOAD_BYTES + 1).ok).toBe(false);
});
test("validateUpload: 잘못된 MIME 거부", () => {
  expect(validateUpload("inbody", "image/png", 1000).ok).toBe(false);
  expect(validateUpload("photo", "application/pdf", 1000).ok).toBe(false);
});
test("validateUpload: 활성 콘텐츠 가능한 SVG 거부", () => {
  expect(validateUpload("photo", "image/svg+xml", 1000).ok).toBe(false);
});
test("validateUpload: 정상 통과", () => {
  expect(validateUpload("photo", "image/jpeg", 1000).ok).toBe(true);
  expect(validateUpload("inbody", "application/pdf", 1000).ok).toBe(true);
});
