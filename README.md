# Peptide Atlas

Peptide Atlas is a five-site Astro publishing system for clinic listings, doctor profiles, evidence-led guides, primary-source news, legal coverage, and weekly reviews. A Node.js pipeline fetches source material, verifies records, drafts content, humanises it, applies deterministic safety checks, and publishes within daily velocity limits.

## Public domain map

| Header section | Public URL | Vercel project directory |
| --- | --- | --- |
| Clinics | https://mypeptide.club | `site/` |
| Doctors & experts | https://toppeptideslist.com | `sites/doctors/` |
| Blog | https://safepeptides.us/blog/ | `sites/content/` |
| News | https://peptidesnews.us/ | `sites/news/` |
| Laws & legal | https://safepeptides.us/legal/ | `sites/content/` |
| Updates | https://peptidesupdates.com/ | `sites/updates/` |

The shared header contains no public `vercel.app` links. Each domain has its own Vercel project root, canonical host, robots file, and sitemap.

## Current launch status

The UI overhaul uses one shared visual system with a different task flow for each property: search-first clinic and doctor directories, a source-and-safety guide library, an editorial news desk, and a weekly digest dashboard. It includes responsive navigation, trust and correction routes, and a bottom-left theme switcher with Clinical, Lab, Wellness, and Editorial themes.

Every deployable site also has a local `/faq/` help center with exactly 500 searchable answers across 10 topics. The build rejects a missing FAQ page, fewer than 500 or more than 600 answers, or a missing FAQ search control.

Previously generated live posts were moved to `pipeline/quarantine/2026-07-17/` after review found weak sourcing and unverifiable claims. Sample markdown remains as schema documentation but is excluded from routes and sitemaps. Production publication should resume only with content that passes the new guard.

## Setup

1. Copy `.env.example` to `.env` in the repository root and add the required local keys.
2. Install dependencies in the root and each Astro project.
3. Run `npm run preflight` and `npm run check` from the repository root.
4. Run `node pipeline/orchestrator.mjs all --dry-run` before the first supervised live run.
5. Configure GitHub Actions secrets before enabling scheduled publication.

Required pipeline keys are `EXA_API_KEY` and `OPENAI_API_KEY`. Gemini image generation is optional. Supabase is also optional and records pipeline-run audits when configured; committed files remain the publishing source of truth. See `ENVIRONMENT.md` for the exact local, GitHub, Supabase, and Vercel configuration.

Public site settings should be added to all five Vercel projects:

- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_CORRECTIONS_EMAIL`
- `PUBLIC_PLAUSIBLE_DOMAIN`, only if Plausible is configured

## Common commands

```powershell
npm test
npm run preflight
npm run build:all
npm run check:sites
npm run check
node pipeline/orchestrator.mjs all --dry-run
node pipeline/orchestrator.mjs all
```

`npm run check` runs guard tests, builds all five sites, and scans the generated output for sample pages, placeholder domains, em dashes, broken internal links, invalid robots references, wrong canonical hosts, incomplete FAQ centers, and diverged shared CSS.

## Pipeline stages

1. Fetch news, clinics, and doctors.
2. Verify clinic websites and doctor NPI records.
3. Draft clinic, doctor, news, legal, and blog content from allowed sources.
4. Humanise the draft without changing facts or citations.
5. Apply deterministic frontmatter, source, claim, length, and record-matching checks.
6. Publish within daily caps, build the affected site, and optionally push when `AUTO_PUSH=true`.
7. Generate the Sunday weekly review and monitoring summary.

GitHub Actions runs the repository check on pushes and pull requests. The scheduled workflow runs the full guarded pipeline every six hours. It creates a local publication commit, validates all five sites, and only then pushes the commit for Vercel to deploy. Manual workflow runs default to dry-run mode.

## Repository map

```text
site/                    clinics Astro site
sites/doctors/           doctors Astro site
sites/content/           Safe Peptides blog and legal Astro site
sites/news/              Peptides News Astro site
sites/updates/           Peptides Updates Astro site
pipeline/orchestrator.mjs
pipeline/lib/            LLM, image, database, and content guard helpers
pipeline/prompts/        stage instructions
pipeline/queue/          file-based work queues
pipeline/quarantine/     withdrawn content retained for audit
pipeline/tests/          deterministic guard tests
.github/workflows/       CI and scheduled pipeline workflows
```

Read `CLAUDE.md` before changing editorial behaviour. See `ARCHITECTURE.md` for system boundaries, `REVIEW.md` for the latest audit, and `ACTION-ITEMS.md` for the remaining owner tasks.
