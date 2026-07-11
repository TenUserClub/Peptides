# Design prompt — paste into Claude Code / Antigravity / any agent (run from repo root)

You are designing the UI/UX for an existing Astro site in `site/`. Read `CLAUDE.md` first (compliance rules affect design — disclaimers and attributions can never be hidden or de-emphasized). Do not change content, frontmatter schemas, JSON-LD, or pipeline files. This is a styling/UX pass only.

## Who this site is for

Peptide-curious consumers and biohackers (25–55, research-driven, skeptical of hype) looking for verified clinics, doctors, and daily regulatory/clinical news. The design must read as **evidence-first modern health**, not supplement-store hype. Benchmarks for tone: Levels, Function Health, Ro, Examine.com — clean, spacious, data-literate, calm. Anti-patterns to avoid: neon "muscle" aesthetics, stock photos of syringes/abs, countdown timers, anything that smells like a research-chem vendor.

## Architecture requirements

1. Extract all styling from `site/src/layouts/Base.astro` into `site/src/styles/global.css`, built entirely on CSS custom properties (design tokens): colors, type scale, spacing, radii, shadows.
2. Implement **three themes** as token sets on `:root[data-theme="..."]`. Default = `clinical`, respecting `prefers-color-scheme` (auto-select `lab` for dark-mode users on first visit).

### Theme 1 — `clinical` (default, light)
Soft warm white background (#FAFAF8-ish), deep slate ink, one restrained accent: clinical teal/emerald (keep close to the existing `#0f6e5c`). Generous whitespace, thin hairline rules. The "trustworthy telehealth" look.

### Theme 2 — `lab` (dark)
Deep charcoal/navy surfaces, soft off-white text, luminous cyan-green accent used sparingly (links, verified badges, data). Subtle monospace for metadata (dates, ratings, NPI). The "longevity biotech dashboard" look biohackers respond to.

### Theme 3 — `wellness` (light, warm)
Warm parchment tones, sage green + terracotta accents, slightly rounder corners, serif display headings. The "integrative clinic" look for the wellness-leaning visitor.

All three must pass WCAG 2.1 AA contrast (4.5:1 body text, 3:1 large text) — verify programmatically, don't eyeball.

## Theme switcher

- Fixed button, **bottom-left corner** of the viewport, all pages. Small circular/pill button (~44px touch target) that opens a 3-option popover (theme names + tiny color-dot previews), or cycles on click with a toast label — your call, but it must be obvious which theme is active.
- Vanilla JS inline in `Base.astro` (or a small Astro component) — **no framework, no dependency**. Persist choice in `localStorage`; apply before first paint (inline `<head>` script setting `data-theme` from storage) so there's zero flash-of-wrong-theme and zero CLS.
- Accessible: `aria-label`, keyboard operable, visible focus ring, `prefers-reduced-motion` respected on any transition.
- Must not overlap the disclaimer/corrections blocks on short pages (z-index + safe-area margins, `env(safe-area-inset-*)` on mobile).

## Typography & layout

- Max 2 font families, loaded as no more than 2 woff2 files total, `font-display: swap`, with system-stack fallbacks sized to minimize CLS (use `size-adjust` fallback metrics). Suggested: Inter or IBM Plex Sans for UI/body; one display or serif for headings (theme 3 may swap heading family via token).
- Fluid type scale via `clamp()`. Reading measure 60–75ch for article bodies. Sentence-case headings everywhere (matches the humaniser's style rules).
- Mobile-first. Article pages: single column. Index/hub pages: card grid (1col → 2col ≥ 720px).

## Components to design (keep existing markup semantics, style + enhance)

- **Header/nav**: sticky, slim, current-section indicator; collapses to a simple accessible menu < 640px.
- **Post cards** (home, indexes): title, one-line description, date, engine label (Clinic/Doctor/News/Update) as a subtle tag — color-coded per engine via tokens.
- **Verified badge**: small check-mark chip shown on clinic/doctor pages (they all have `verified: true`). Tooltip/title text: "Facts checked against the clinic's own site and the NPI registry."
- **Rating chip**: e.g. "4.8★ · 120 reviews on Google" — platform name always visible (compliance rule: attribution can't be dropped or shrunk into illegibility).
- **Methodology box** on roundups: visually distinct callout (left border + tinted background), directly under the H1 area — it must be *more* prominent, not less.
- **Sources**: superscript-style footnote links styled as a tidy numbered row, not a wall of raw URLs.
- **Medical disclaimer + corrections blocks**: keep at full width above the footer, readable size (≥ 0.8rem), never collapsed, never lower contrast than AA.
- **CTA** ("Request a consultation referral"): one accent button per page, calm not shouty.
- **Breadcrumbs** on clinic/doctor pages: Home → Clinics → FL → Miami → Clinic.
- Empty states (indexes with no posts yet) styled intentionally.

## Performance budget (hard limits — the site's ranking depends on it)

- Total JS shipped ≤ 5 KB (theme switcher + nav toggle only). No client framework.
- Lighthouse (mobile, throttled): Performance ≥ 95, Accessibility ≥ 95, SEO ≥ 95. CLS ≈ 0, LCP < 2.0s on the article template.
- No images required by the design system (SVG logo/icons inline only). If you add decorative elements, CSS-only.

## Process

1. Build the token system + all three themes in `global.css`.
2. Refactor `Base.astro`, add the switcher, restyle each page template.
3. `npm run build` must pass; view every template (`npm run dev`) in all 3 themes at 360px, 768px, 1280px.
4. Run an accessibility/contrast check per theme and fix failures.
5. Finish with a summary: files changed, contrast results, JS byte count, and anything you deliberately left alone.

Do not touch: `pipeline/`, content markdown, frontmatter schemas, JSON-LD blocks, sitemap config, or the wording of disclaimers/methodology/attributions.
