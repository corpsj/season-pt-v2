# Wanted Design System

A faithful, code-first recreation of **Wanted**'s product design system — the design language behind Wanted Lab's recruiting platform (원티드), extracted from the *"Wanted Design System (Community)"* Figma file. It packages the brand's tokens, typography, iconography, logos and reusable UI primitives so design agents can produce on-brand Wanted interfaces, mocks and prototypes.

> **Sources** — Built from the attached Figma community file *"Wanted Design System (Community).fig"* (770 component sets, 494 variables, ~280-glyph icon set). Token values, the icon set and logos were extracted directly from that file; the public brand was used only to confirm what was read. Fonts (Pretendard JP, Wanted Sans) are loaded from their official open-source CDNs.

## What is Wanted?

Wanted (원티드 / Wanted Lab, Inc.) is a major Korean career platform. Job-seekers discover positions through AI-matched recommendations, manage applications and résumés, and follow companies; companies recruit through referrals. The system spans several sub-brands — **Wanted** (core jobs), **Wanted Space** (events/community), **Wanted Gigs** (freelance), **Wanted Agent** (AI agent), **LaaS** and **Wanted One ID**. The product is bilingual-leaning (Korean-first, with English/Japanese support via Pretendard JP) and reads clean, calm and trustworthy — a tool people use for high-stakes career decisions.

---

## Content fundamentals

How Wanted writes (recreated from the file's UI copy; primary language is Korean):

- **Voice — warm, encouraging, plain.** Copy speaks *to* the user and roots for them: "지원이 완료되었어요" (Your application is in), "곧 결과를 알려드릴게요" (We'll let you know soon). It avoids corporate stiffness.
- **Polite informal register (해요체).** Korean copy uses the friendly `-요` ending, not the formal `-습니다`. It feels like a helpful peer, not an institution.
- **Short, action-first labels.** Buttons are verbs: 지원하기 (Apply), 스크랩 (Save), 팔로우 (Follow), 더보기 (More). Rarely more than 2–4 syllables.
- **Concrete over clever.** Status is stated plainly — D-3, 마감 (Closed), 합격 (Passed), 신입 (Entry-level). Numbers and facts over marketing adjectives.
- **Sentence-style English, no ALL-CAPS.** When English appears it's title- or sentence-case ("Find your work").
- **No emoji in product UI.** Meaning is carried by the icon set, not emoji. (Emoji may appear in user-generated social content, never in chrome.)
- **Restraint.** One primary action per view; supporting text is brief and only when it helps. No data slop.

---

## Visual foundations

- **Color.** A disciplined, mostly-neutral palette with a single confident brand blue — `--primary-normal` **#3366FF** (light) — used sparingly for primary actions, links and active states. Text and surfaces are built from a *cool* neutral gray ramp (slightly blue-tinted), not pure gray. An extended accent set (cyan, lime, green, orange, red-orange, red, pink, purple, violet, light-blue) tags content categories. Status: green positive, red negative, orange cautionary. Full light **and** dark themes plus iOS/macOS material tokens are included.
- **Semantic token layers.** Colors resolve through named roles — `label-*` (normal/neutral/alternative/assistive/disable) for text, `background-*`, `fill-*` (translucent neutral fills at 5/8/16% alpha), `line-*` (hairlines at 8–52% alpha), `status-*`, `accent-*`. Always reach for the semantic token, not a raw hue.
- **Typography.** **Pretendard JP** everywhere in UI — a system-ui-class sans with full KR/EN/JP coverage. A 7-tier scale (Display → Title → Heading → Headline → Body → Label → Caption) with 18 sub-steps, each pairing a fixed size / line-height / letter-spacing. Tracking is tight and negative on large display sizes, loosening to slightly positive on small caption sizes. Weights: Bold 700 (display/title), SemiBold 600 (emphasis, labels), Medium 500 (most body/UI), Regular 400. **Wanted Sans** is reserved for brand moments and logo lockups.
- **Shape & radius.** Soft but not pill-y. Controls use 8/10/12px radii by size; cards 16px; modals up to 20px. Avatars are circular (people) or squircle ~28% (companies). Switches/badges/numeric pills go fully round.
- **Elevation.** Soft, tight, low-alpha shadows on near-white surfaces — never heavy drops. Cards often rely on a 1px translucent line instead of a shadow. Four steps: emphasize → normal → strong → overlay.
- **Backgrounds.** Flat. White or near-white `--background-normal-normal`; alternative surfaces a hair cooler. No gradients, no textures, no decorative noise in product chrome. Imagery (company logos, profile photos, event covers) provides the color.
- **Interaction.** Hover and press are a subtle **darken overlay** (Wanted's "Interaction" layer) — ~6% on hover, ~11% on press — applied uniformly over any variant, rather than per-variant color swaps. Focus shows a 3px primary-tinted ring. Transitions are short (.12–.18s) and easeful; no bounces, no decorative looping animation.
- **Disabled.** Surface drops to `--interaction-disable` (near-white) with `label-disable` text, or the whole control dims to ~43% opacity (controls/switches).
- **Layout.** Generous whitespace, clear column rhythm on a 4px grid, responsive viewport tokens (lg 1100 / xl 1440). Content-forward and uncluttered.

---

## Iconography

- **One cohesive in-house set, ~280 glyphs**, extracted from the Figma file into `assets/icons/` as `icon-data.js` (name → `{ viewBox, body }`) with an `Icon.jsx` wrapper. Render `<Icon name="search" size={20} />`.
- **Monoline + filled pairs.** Most concepts ship as an outline (default) and a `-fill` variant (e.g. `heart` / `heart-fill`, `bookmark` / `bookmark-fill`). A few have a `-bold` (thick) variant. Outline for inactive/neutral, fill for active/selected/emphasis.
- **24px grid, ~1.5px stroke, rounded joins.** Geometric, friendly, consistent optical weight.
- **`currentColor`.** Every icon inherits text color — set `color` (or the parent's) to recolor; no hardcoded fills.
- **Brand/logo glyphs included** — `logo-google`, `logo-apple`, `logo-kakao`, `logo-naver-blog`, `logo-linked-in`, `logo-facebook`, `logo-x`, `logo-youtube`, `logo-instagram`, `logo-google-play` for auth and share.
- **No emoji, no unicode-as-icon** in product UI. The icon set is the single source of pictograms.
- See the **Iconography** card in the Design System tab for a sampling.

---

## Index / manifest

**Root**
- `styles.css` — global entry point (consumers link this); `@import` manifest only.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills front-matter for use in Claude Code.

**Tokens** (`tokens/`)
- `fonts.css` — Pretendard JP + Wanted Sans `@import`s (CDN).
- `fig-tokens.css` — 494 Figma Variables: full color system, light/dark + iOS/macOS modes, radii, spacing floats.
- `typography.css` — type scale tokens + `.wds-*` utility classes.
- `spacing.css` — 4px spacing scale, radius scale, elevation shadows.

**Components** (`components/`) — React primitives + per-directory `@dsCard`:
- `actions/` — **Button**, **IconButton**
- `display/` — **Badge**, **Tag**, **Chip**, **Avatar**, **Card**, **Divider**
- `selection/` — **Checkbox**, **Radio**, **Switch**
- `forms/` — **TextField**, **Select**
- `feedback/` — **Alert**, **Toast**, **Tooltip**, **Spinner**
- `navigation/` — **Tabs**
- `styles/components.css` — class-based styling for all of the above.

**Assets** (`assets/`)
- `icons/` — `Icon.jsx`, `icon-data.js` (~280 glyphs), `Icon.d.ts`.
- `logos/` — Wanted wordmark, symbol, and Space / Agent / Gigs lockups (black/white) as React SVG components.

**Guidelines** (`guidelines/`) — foundation specimen cards (colors, type, spacing, radius/elevation).

**UI kits** (`ui_kits/`) — full-screen product recreations (see each kit's README).

---

## Using the system

- **Components** are exposed on `window.WantedDesignSystem_62ae87` once the bundle compiles — e.g. `const { Button, Icon } = window.WantedDesignSystem_62ae87`.
- **Styling** is class-based (`wds-*`) and keyed entirely to the CSS custom properties. Recolor or theme by overriding tokens, not by editing components.
- **Dark mode**: add `data-theme="dark"` (or class `dark`) to a root element — token values flip automatically.

> Caveat: Pretendard JP and Wanted Sans load from public CDNs (jsDelivr) — both are verified loading. For production/offline use, self-host the woff2 files and swap the `@import`s in `tokens/fonts.css` for local `@font-face` rules.
