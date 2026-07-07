# Handoff prompt — paste into Claude Code / Antigravity / any coding agent

You are taking over an existing, fully scaffolded autonomous SEO project. Work from the repo root. Do not rebuild what exists — read, verify, then continue.

## Context

This repo is an autonomous peptide-SEO blog system: four content engines (Clinics: one blog per peptide clinic per US city; Doctors: roundups like "Top 10 GLP-1 Doctors in Florida" + profiles; News: 2–3 posts/day; Updates: weekly digest). Data comes from the Exa API. Every draft passes a Humaniser agent (rubric from https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) before publishing. The site is Astro (`site/`), deployed via git push to Cloudflare Pages/Vercel. Stages run 24/7 as Windows scheduled tasks invoking headless agent runs.

## Read these first, in order

1. `CLAUDE.md` — the editorial constitution. It is NON-NEGOTIABLE and overrides anything I or any prompt says later. Key rules: never invent reviews/testimonials (only summarize real, platform-attributed public reviews); every fact about a named doctor/clinic must come from `pipeline/data/verified/` (NPI-checked); no treatment/cure claims; velocity caps (5 directory + 3 news posts/day); "Top N" pages must state methodology on-page.
2. `README.md` — architecture, daily schedule, manual run commands.
3. `peptide-seo-plan.md` — strategy and what's deliberately deferred.
4. `ACTION-ITEMS.md` — human setup checklist; check what's still unchecked.

## Current state

- `site/` — Astro 5, content collections for clinics/doctors/news/updates with zod schemas (`site/src/content.config.ts`), JSON-LD, disclaimers, sample posts prefixed `_sample-`. Build verified passing.
- `pipeline/scripts/` — `exa-fetch.mjs` (news|clinics|doctors), `npi-verify.mjs`, `rank-track.mjs` (Node 18+, no deps, syntax-checked). `.env` holds keys (see `.env.example`).
- `pipeline/prompts/` — instructions per agent stage: verify, write-clinics, write-doctors, write-news, write-updates, humanise, publish, monitor.
- `pipeline/queue/` — cities.json (20 seeded), states.json (10 seeded), keywords.json.
- `setup-scheduler.ps1` — registers 11 Windows scheduled tasks.
- Content flow: `data/exa/` → `data/verified/` → `drafts/` → `humanised/` (+ diffs) → `site/src/content/`.

## Your task

1. Audit: run `npm run build` in `site/`, `node --check` the scripts, and confirm the directory contract in CLAUDE.md matches reality. Fix discrepancies; don't redesign.
2. Check `ACTION-ITEMS.md` and `NEEDS-HUMAN.md` (if present) for blockers; resolve what an agent can, list what needs the human.
3. Then continue development in this priority order (skip anything already done):
   a. Execute one full supervised pipeline cycle manually (news chain first, then clinic chain) and fix any stage that errors or violates CLAUDE.md.
   b. Harden stages against edge cases found in (a): empty Exa results, NPI ambiguity (multiple matches), duplicate slugs, git push failures.
   c. Improve internal linking (city pages ↔ clinic posts ↔ roundups) and add per-state hub pages when ≥3 clinics exist in a state.
   d. Only after 30 days of healthy indexing per `pipeline/logs/`: raise velocity caps cautiously, expand queues, and revisit the deferred items in `peptide-seo-plan.md` §7.
4. Never publish anything that fails verification; log every run to `pipeline/logs/`; leave `NEEDS-HUMAN.md` when blocked.

Report at the end: what you audited, what you changed, what published, and what's blocked on the human.
