# Peptide Atlas design specification

This document records the implemented UI system. Preserve the editorial safeguards in `CLAUDE.md` whenever the interface changes.

## Product character

Peptide Atlas should feel evidence-first, calm, precise, and editorial. Avoid supplement-store styling, exaggerated performance imagery, urgency tactics, or anything that resembles a research-chemical vendor.

## Shared design system

All five Astro sites use the same dependency-free stylesheet and layout pattern. The canonical stylesheet is `sites/doctors/public/styles/global.css`; copies in the other projects must remain identical.

The bottom-left theme control provides four choices:

1. Clinical: clean light surfaces and green accents.
2. Lab: dark technical surfaces with mint accents.
3. Wellness: warm neutral surfaces and botanical green.
4. Editorial: paper tones and blue ink.

The chosen theme persists in `localStorage`, applies before first paint, exposes an accessible menu, and defaults to Lab for a first-time visitor whose operating system prefers dark mode.

## Navigation

The header is a shared network navigation. Clinics, Doctors & experts, News, Laws & legal, Blog, and Updates point to the public custom-domain map in `src/lib/sections.ts`. Use absolute URLs across domains and local paths only within the current canonical domain.

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
