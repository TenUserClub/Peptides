# Peptide SEO Engine

Autonomous content pipeline: clinic directory, doctor directory, blog, news, and legal coverage — all feeding an Astro site, run by a Node.js orchestrator + OpenAI writer agents.

## Architecture

- **Orchestrator** (`pipeline/orchestrator.mjs`) — a plain Node.js script that runs the full pipeline. Works with any agent (Kimi, Claude Code, etc.) or run manually.
- **OpenAI** (GPT-4o) handles writing and humanising
- **Exa API** fetches raw research and news data
- **Gemini API** (optional) generates featured images for posts
- **Vercel** hosts the site on a free `*.vercel.app` domain
- **Supabase** (free tier) persists clinic records, rankings, and queue state — already connected and working

**Agent-agnostic by design.** The orchestrator is just a Node.js script. Any coding agent can run it, or you can run it manually, or schedule it via cron/Task Scheduler/GitHub Actions. There is no lock-in to any specific AI platform.

## Sections

| Section | What it is | Content type |
|---|---|---|
| **Clinics** | Directory of verified peptide therapy clinics by city | Directory listings with search + filters |
| **Doctors** | Directory of verified physicians + editorial roundups | Directory listings with search + filters |
| **Blog** | Evergreen educational guides and explainers | Long-form reference content |
| **News** | Daily peptide industry and regulatory news | Time-sensitive reporting |
| **Laws & legal** | Regulatory updates, FDA actions, court rulings | Legal analysis |
| **Weekly updates** | Digest linking the week's content | Internal link hub |

## Layout

```
CLAUDE.md            editorial constitution (all agents inherit)
site/                Astro site — content in site/src/content/{clinics,doctors,blog,news,legal,updates}
pipeline/
  orchestrator.mjs    Pipeline orchestrator: fetch → write → humanise → publish → monitor
  lib/               llm.mjs (OpenAI/Gemini) · images.mjs (prompt templates) · db.mjs (Supabase)
  scripts/           exa-fetch.mjs (news|clinics|doctors) · npi-verify.mjs · lib.mjs
  prompts/           agent instructions per stage (verify, write-*, humanise, publish, monitor)
  queue/             cities.json, states.json (work queues)
  data/              exa/ (raw) → verified/ (fact-checked)
  drafts/ → humanised/ → site/src/content/   (the content conveyor belt)
.env                 keys (EXA, OPENAI, GEMINI, SUPABASE) — never commit
```

## Daily flow (automatic)

The orchestrator runs on whatever schedule you set — Kimi cron, Windows Task Scheduler, GitHub Actions, or manually. Every 6 hours is recommended.

The orchestrator decides what to do based on time of day:

| Time window | What happens |
|---|---|
| Every run | Fetch news (Exa) → write news + blog (OpenAI) → humanise → publish |
| 02:00–06:00 | Also fetch clinics + doctors, run verification |
| 06:00–08:00 | Also run monitor (daily summary) |

Velocity caps enforced automatically:
- Max 3 news + legal posts/day
- Max 2 blog posts/day
- Max 5 clinic + doctor directory posts/day

**Runs with any agent:** The orchestrator is just `node pipeline\orchestrator.mjs all`. Kimi, Claude Code, or your terminal — all the same command.

## First-time setup

1. Copy `.env.example` → `.env` and fill in `EXA_API_KEY`, `OPENAI_API_KEY`, `SITE_DOMAIN`
2. `cd site && npm install && npm run build` — verify it builds
3. Push to a new private GitHub repo. Connect to Vercel (free Hobby): import the repo, set **Root Directory** to `site`, deploy.
4. Update `SITE_DOMAIN` in `.env` with your actual Vercel domain
5. Run the first supervised cycle manually (below), then set up your scheduler (cron, Task Scheduler, GitHub Actions, etc.)

## Run any stage manually

```powershell
# Full pipeline (what the cron job runs)
node pipeline\orchestrator.mjs all

# Individual stages (for testing / debugging)
node pipeline\orchestrator.mjs fetch-news
node pipeline\orchestrator.mjs write-news
node pipeline\orchestrator.mjs write-blog
node pipeline\orchestrator.mjs humanise
node pipeline\orchestrator.mjs publish
node pipeline\orchestrator.mjs monitor

# Dry run — simulates without calling APIs or writing files
node pipeline\orchestrator.mjs all --dry-run

# Exa fetch (standalone)
node pipeline\scripts\exa-fetch.mjs news        # or clinics | doctors

# NPI verify (standalone)
node pipeline\scripts\npi-verify.mjs "John" "Smith" FL

# Preview site locally
cd site && npm run dev                            # localhost:4321
```

## Design guarantees

- Nothing publishes without passing the humaniser (OpenAI rewrite against the Wikipedia AI-writing rubric)
- Reviews are only ever summaries of real, platform-attributed public reviews (FTC fake-review rule)
- Velocity-capped publishing to stay clear of Google's scaled-content-abuse classification
- Every stage logs to `pipeline/logs/`
- The orchestrator commits locally; you manually `git push` when ready
- Clinic/doctor data verified against NPI registry + clinic's own site before publishing

## Costs (monthly)

| Item | Cost | Notes |
|---|---|---|
| Exa API | ~$20–50 | News fetches 3×/day + city/state fetches |
| OpenAI (GPT-4o) | ~$30–60 | Writing + humanising (~6 posts/day) |
| Gemini images | ~$0–15 | Optional, ~$0.01 per image |
| Vercel Hobby | **$0** | Free tier |
| Supabase | **$0** | Free tier (already connected) |
| **Total** | **~$50–125/mo** | Lower end if using gpt-4o-mini for humanising |

## Multi-domain plan

This repo stays ONE monorepo. `site/` is the permanent home of the central **clinic registry**. Other sections may move to their own domains later. The section→domain mapping lives in `site/src/lib/sections.ts`.

## More docs

- `CLAUDE.md` — editorial constitution (hard rules every agent follows)
- `ARCHITECTURE.md` — deep dive on database, Supabase integration, costs
- `REVIEW.md` — gap analysis, roadmap, risk assessment
- `peptide-seo-plan.md` — original strategy document
