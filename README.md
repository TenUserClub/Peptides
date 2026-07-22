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

The UI overhaul uses one shared visual system with a different task flow for each property: search-first clinic and doctor directories, a source-and-safety guide library, an editorial news desk, and a weekly digest dashboard. It uses a permanent warm Wellness palette, self-hosted Plus Jakarta Sans typography, responsive navigation, trust and correction routes, and a shared Peptide Atlas logo. There is no theme switcher.

Safe Peptides exposes an RSS feed at `/blog/feed.xml`; Peptide Updates exposes one at `/feed.xml`. Both sites can point to a free Beehiiv or Substack subscribe page through the optional `PUBLIC_NEWSLETTER_URL` build setting. Subscriber details never pass through this static-site repository.

Each of the six header sections has exactly 100 searchable, section-specific FAQ answers across 10 topic groups. Blog and Laws & legal have separate centers even though they share one deployment. The build rejects a missing center, any count other than 100, duplicate FAQ identifiers, or a missing search control.

Previously generated live posts were moved to `pipeline/quarantine/2026-07-17/` after review found weak sourcing and unverifiable claims. Sample markdown remains as schema documentation but is excluded from routes and sitemaps. Production publication should resume only with content that passes the new guard.

## Setup

1. Copy `.env.example` to `.env` in the repository root and add the required local keys.
2. Install dependencies in the root and each Astro project.
3. Run `npm run preflight` and `npm run check` from the repository root.
4. Run `node pipeline/orchestrator.mjs all --dry-run` before the first supervised live run.
5. Configure GitHub Actions secrets before enabling scheduled publication.

Required pipeline keys are `EXA_API_KEY` and `OPENAI_API_KEY`. Gemini image generation is optional. The scheduled workflow also requires Supabase for run audits and operational mirrors; committed files remain the publishing source of truth. See `ENVIRONMENT.md` for the exact local, GitHub, Supabase, and Vercel configuration.

Public site settings should be added to all five Vercel projects:

- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_CORRECTIONS_EMAIL`
- `PUBLIC_SECURITY_EMAIL`, if a monitored disclosure mailbox is available
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

`npm run check` runs secret and guard checks, builds all five sites, and scans the generated output for sample pages, placeholder domains, em dashes, broken internal links, invalid robots references, wrong canonical hosts, incomplete FAQ centers, missing security headers or disclosure files, and diverged shared CSS.

## Pipeline stages

1. Sync seed keywords or free Google Search Console query metrics into Supabase.
2. Fetch news, clinics, and doctors.
3. Verify clinic websites and doctor NPI records and mirror them into Supabase.
4. Select the next evergreen brief from `pipeline/queue/blog-topics.json`, boosted by matching Search Console opportunities. News searches five primary-source lanes covering US regulation, enforcement and courts, clinical research, international regulators, and official company disclosures.
5. Draft clinic, doctor, news, legal, and blog content from allowed sources.
6. Humanise every draft, including blog posts, without changing facts, citations, or frontmatter.
7. Apply deterministic frontmatter, source, claim, length, writing-pattern, and record-matching checks.
8. Publish within daily caps, mirror publication metadata into Supabase, and build the affected site.
9. Mirror every queued, drafted, blocked, and published item with its source context, exact content hash, validation result, and repository commit into Supabase.
10. Generate the Sunday weekly review and monitoring summary.

GitHub Actions runs the repository check on pushes and pull requests. The guarded pipeline runs three times daily at 02:23, 10:23, and 18:23 UTC (07:53, 15:53, and 23:53 India time). Daily publication caps apply across all three runs, so extra runs improve freshness and retries without tripling output. Manual workflow runs default to dry-run mode.

Maximum publication if every source, verification, human edit, and build passes: 3 combined news/legal posts, 1 blog guide, and 5 combined clinic/doctor entries per day. Sunday can also add 1 weekly update. That is at most 9 ordinary-day items, 10 on Sunday, or 64 in a full seven-day week. Actual output is normally lower because unverified or weak material is refused.

Clinic discovery begins with one representative metro in every US state. The queue finishes all verified, publishable records for its current metro before advancing, so a city with several valid clinics can span multiple daily runs. After this first 50-state pass, additional cities can be appended for deeper state coverage without changing the workflow.

Doctor discovery also begins with one focused query in every US state before any state repeats. Its current California in-flight batch and queue pointer are preserved while the remaining states complete the first nationwide pass.

The seed editorial map contains at least 30 source-led topics, ordered by priority. It is a topic and intent plan, not a claim of measured search volume. The pipeline publishes at most one evergreen guide per day, skips briefs already present in drafts or published content, and refuses to write when fewer than two approved authoritative sources are reachable. News and legal candidates are independently deduplicated by exact primary-source URL. The source class is stored in frontmatter and checked against the URL, and research or company material cannot be misrouted as legal authority.

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
