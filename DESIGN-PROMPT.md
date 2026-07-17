# Peptide Atlas design specification

This document records the implemented UI system. Preserve the editorial safeguards in `CLAUDE.md` whenever the interface changes.

## Product character

Peptide Atlas should feel evidence-first, calm, precise, and editorial. Avoid supplement-store styling, exaggerated performance imagery, urgency tactics, or anything that resembles a research-chemical vendor.

## Shared design system

All three Astro sites use the same dependency-free stylesheet and layout pattern. The canonical stylesheet is `sites/doctors/public/styles/global.css`; copies in the other projects must remain identical.

The bottom-left theme control provides four choices:

1. Clinical: clean light surfaces and green accents.
2. Lab: dark technical surfaces with mint accents.
3. Wellness: warm neutral surfaces and botanical green.
4. Editorial: paper tones and blue ink.

The chosen theme persists in `localStorage`, applies before first paint, exposes an accessible menu, and defaults to Lab for a first-time visitor whose operating system prefers dark mode.

## Navigation

The header is a shared network navigation. Clinics, Doctors, News, Laws & legal, Blog, and Updates must point to the actual project that owns the section. Use absolute URLs for cross-project destinations and local paths only within the current project. When custom domains arrive, update the shared `SITES` maps rather than adding redirect workarounds.

## Content patterns

- Directory pages use search and filter controls, verified states, compact metadata, and clear empty states.
- Article pages show author, date, primary or supporting sources, related reading, and correction information.
- Roundups place methodology near the heading.
- Disclaimers, source attribution, and corrections must remain legible and cannot be hidden.
- Empty or withdrawn collections should explain the review state instead of rendering sample content.

## Accessibility and performance

- Maintain WCAG AA contrast for body text and large text.
- Preserve keyboard focus states, the skip link, semantic landmarks, and reduced-motion support.
- Keep touch targets at least 44 pixels.
- Use no client framework and no external font dependency.
- Keep layout shift low and lazy-load non-critical images.
- Test at 360, 768, and 1280 pixel widths.

## Release checks

Run `npm run check`. The check builds all projects and rejects stylesheet drift, broken internal links, sample routes, placeholder domains, em dashes in rendered output, and invalid robots sitemap references.
