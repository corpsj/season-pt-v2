/**
 * Generate the link-preview (Open Graph) image used when the URL is pasted into
 * KakaoTalk / messengers. 1200×630, brand cream + logo + per-platform install steps.
 * Run: bun run scripts/gen-og.ts
 */
import sharp from "sharp";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const W = 1200;
const H = 630;
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#FAF8F4"/>
  <text x="316" y="160" font-family="${FONT}" font-size="60" font-weight="700" fill="#3a372f">계절 PT &amp; 필라테스</text>
  <text x="318" y="212" font-family="${FONT}" font-size="30" font-weight="500" fill="#768c6a">설치하고 앱처럼 사용하세요</text>
  <line x1="120" y1="300" x2="1080" y2="300" stroke="#e6e0d4" stroke-width="2"/>
  <text x="120" y="382" font-family="${FONT}" font-size="34" font-weight="700" fill="#3a372f">아이폰 · Safari</text>
  <text x="120" y="428" font-family="${FONT}" font-size="30" font-weight="500" fill="#5a564d">링크 열기 → 공유 → ‘홈 화면에 추가’</text>
  <text x="120" y="506" font-family="${FONT}" font-size="34" font-weight="700" fill="#3a372f">안드로이드 · Chrome</text>
  <text x="120" y="552" font-family="${FONT}" font-size="30" font-weight="500" fill="#5a564d">링크 열기 → 메뉴 ⋮ → ‘앱 설치’</text>
</svg>`;

const logo = await sharp(resolve(root, "public/brand/brand-mark.png"))
  .resize(170, 170, { fit: "inside" })
  .png()
  .toBuffer();

await sharp(Buffer.from(svg))
  .composite([{ input: logo, top: 70, left: 120 }])
  .png()
  .toFile(resolve(root, "public/brand/og.png"));

console.log("✅ wrote public/brand/og.png (1200x630)");
