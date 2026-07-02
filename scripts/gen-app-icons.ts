/**
 * Generate PWA/app icons from the transparent sage logo (public/brand/brand-mark.png)
 * flattened onto the brand cream (#FAF8F4) so the install/splash icon shows the logo on
 * cream — never the OS default dark fill behind a transparent maskable.
 *
 * Run: bun run scripts/gen-app-icons.ts
 */
import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const SRC = resolve(root, "public/brand/brand-mark.png");
const CREAM = { r: 250, g: 248, b: 244, alpha: 1 }; // #FAF8F4

async function make(out: string, size: number, logoRatio: number) {
  const logoPx = Math.round(size * logoRatio);
  // trim() strips the source's transparent padding first, so logoRatio controls the
  // VISIBLE emblem size (not the padded canvas) — otherwise raising the ratio barely grows it.
  const logo = await sharp(SRC).trim().resize(logoPx, logoPx, { fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(resolve(root, out));
  console.log("wrote", out, `${size}px logo@${Math.round(logoRatio * 100)}%`);
}

// "any" icons — trimmed emblem fills the canvas with a small edge margin (unmasked)
await make("public/brand/icon-512.png", 512, 0.86);
await make("public/brand/icon-192.png", 192, 0.86);
// maskable — emblem is round & centered, so ratio 0.7 keeps it within the circle-mask
// safe zone (emblem radius ≈0.35 < the guaranteed r=0.4 zone).
await make("public/brand/maskable-512.png", 512, 0.7);
// apple-touch-icon (iOS home screen, opaque; iOS rounds the corners, round emblem is safe)
await make("public/brand/apple-touch-icon.png", 180, 0.84);
console.log("✅ icons generated");
