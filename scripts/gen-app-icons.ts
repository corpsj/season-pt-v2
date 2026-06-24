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
  const logo = await sharp(SRC).resize(logoPx, logoPx, { fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CREAM } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(resolve(root, out));
  console.log("wrote", out, `${size}px logo@${Math.round(logoRatio * 100)}%`);
}

// "any" icons — generous logo
await make("public/brand/icon-512.png", 512, 0.8);
await make("public/brand/icon-192.png", 192, 0.8);
// maskable — logo inside the inner ~80% safe zone (mask can crop edges)
await make("public/brand/maskable-512.png", 512, 0.62);
// apple-touch-icon (iOS home screen, opaque)
await make("public/brand/apple-touch-icon.png", 180, 0.78);
console.log("✅ icons generated");
