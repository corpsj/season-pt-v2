/**
 * Generate PWA/app icons from the transparent sage logo (public/brand/brand-mark.png)
 * flattened onto the brand cream (#FAF8F4) so the install/splash icon shows the logo on
 * cream — never the OS default dark fill behind a transparent maskable.
 *
 * Run: bun run scripts/gen-app-icons.ts
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const SRC = resolve(root, "public/brand/brand-mark.png");
const CREAM = { r: 250, g: 248, b: 244, alpha: 1 }; // #FAF8F4

// 크림 배경에 트림한 엠블럼을 얹은 정사각 PNG 버퍼. (앱 아이콘·파비콘 공통 소스)
async function makeBuffer(size: number, logoRatio: number): Promise<Buffer> {
  const logoPx = Math.round(size * logoRatio);
  // trim() strips the source's transparent padding first, so logoRatio controls the
  // VISIBLE emblem size (not the padded canvas) — otherwise raising the ratio barely grows it.
  const logo = await sharp(SRC).trim().resize(logoPx, logoPx, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

async function make(out: string, size: number, logoRatio: number) {
  writeFileSync(resolve(root, out), await makeBuffer(size, logoRatio));
  console.log("wrote", out, `${size}px logo@${Math.round(logoRatio * 100)}%`);
}

// PNG-encoded ICO(모든 최신 브라우저·Windows Vista+ 지원). 여러 크기를 한 .ico에 담는다.
function icoFromPngs(items: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(items.length, 4);
  let offset = 6 + items.length * 16;
  const entries = items.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...items.map((i) => i.data)]);
}

// "any" icons — trimmed emblem fills the canvas with a small edge margin (unmasked)
await make("public/brand/icon-512.png", 512, 0.86);
await make("public/brand/icon-192.png", 192, 0.86);
// maskable — emblem is round & centered, so ratio 0.7 keeps it within the circle-mask
// safe zone (emblem radius ≈0.35 < the guaranteed r=0.4 zone).
await make("public/brand/maskable-512.png", 512, 0.7);
// apple-touch-icon (iOS home screen, opaque; iOS rounds the corners, round emblem is safe)
await make("public/brand/apple-touch-icon.png", 180, 0.84);

// 브라우저 탭 파비콘 — 앱 아이콘과 동일한 크림 배경 브랜드 마크로 통일.
// (기존 favicon.ico는 검은 원+흰 삼각형 플레이스홀더였음)
await make("src/app/icon.png", 256, 0.86); // 최신 브라우저용 고해상 PNG (Next가 자동 링크)
const fav = icoFromPngs([
  { size: 16, data: await makeBuffer(16, 0.92) }, // 작은 크기일수록 엠블럼을 더 크게
  { size: 32, data: await makeBuffer(32, 0.9) },
  { size: 48, data: await makeBuffer(48, 0.88) },
]);
writeFileSync(resolve(root, "src/app/favicon.ico"), fav);
console.log("wrote src/app/favicon.ico 16/32/48px");
console.log("✅ icons generated");
