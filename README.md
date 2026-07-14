# Peptide SEO Engine

Autonomous content pipeline: clinic directory, doctor directory, blog, news, and legal coverage — all feeding separate Astro sites, run by a Node.js orchestrator + OpenAI writer agents.

## Architecture

- **Orchestrator** (`pipeline/orchestrator.mjs`) — a plain Node.js script that runs the full pipeline. Works with any agent (Kimi, Claude Code, etc.) or run manually.
- **OpenAI** (GPT-4o) handles writing and humanising
- **Exa API** fetches raw research and news data
- **Gemini API** (optional) generates featured images for posts
- **Vercel** hosts three separate sites on free `*.vercel.app` domains
- **Supabase** (free tier) persists clinic records, rankings, and queue state — already connected and working

**Agent-agnostic by design.** The orchestrator is just a Node.js script. Any coding agent can run it, or you can run it manually, or schedule it via cron/Task Scheduler/GitHub Actions. There is no lock-in to any specific AI platform.

## Multi-site structure

Each section lives on its own domain for better SEO focus and cleaner user experience:

| Site | Domain | Content | Collection |
|---|---|---|---|
| **Clinics** | `peptide-clinics.vercel.app` | Verified peptide therapy clinic directory | `site/` |
| **Doctors** | `peptide-doctors.vercel.app` | Verified physicians + editorial roundups | `sites/doctors/` |
| **Hub** | `peptide-hub.vercel.app` | Blog, news, legal, weekly updates | `sites/content/` |

Each navbar item links to the other sites (cross-domain navigation). The mapping lives in `site/src/lib/sections.ts`, `sites/doctors/src/lib/sections.ts`, and `sites/content/src/lib/sections.ts`.

## Sections

| Section | What it is | Content type | Site |
|---|---|---|---|
| **Clinics** | Directory of verified peptide therapy clinics by city | Directory listings with search + filters | Clinics |
| **Doctors** | Directory of verified physicians + editorial roundups | Directory listings with search + filters | Doctors |
| **Blog** | Evergreen educational guides and explainers | Long-form reference content | Hub |
| **News** | Daily peptide industry and regulatory news | Time-sensitive reporting | Hub |
| **Laws & legal** | Regulatory updates, FDA actions, court rulings | Legal analysis | Hub |
| **Weekly updates** | Digest linking the week's content | Internal link hub | Hub |

## Layout

```
CLAUDE.md            editorial constitution (all agents inherit)
site/                Astro site — clinics registry (clinics content only)
sites/
  doctors/           Astro site — doctors & experts directory
  content/           Astro site — blog, news, legal, updates
pipeline/
  orchestrator.mjs   Pipeline orchestrator: fetch → write → humanise → publish → monitor
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
2. `cd site && npm install && npm run build` — verify clinics site builds
3. `cd sites/doctors && npm install && npm run build` — verify doctors site builds
4. `cd sites/content && npm install && npm run build` — verify content hub builds
5. Push to a new private GitHub repo.
6. Connect each site to Vercel (free Hobby):
   - **Clinics:** import repo, set **Root Directory** to `site`, deploy → `peptide-clinics.vercel.app`
   - **Doctors:** import repo, set **Root Directory** to `sites/doctors`, deploy → `peptide-doctors.vercel.app`
   - **Hub:** import repo, set **Root Directory** to `sites/content`, deploy → `peptide-hub.vercel.app`
7. Update `SITE_DOMAIN` and the `SITES` constants in each `src/lib/sections.ts` with your actual Vercel domains
8. Run the first supervised cycle manually (below), then set up your scheduler (cron, Task Scheduler, GitHub Actions, etc.)

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

# Preview sites locally
cd site && npm run dev                            # localhost:4321 — clinics
cd sites/doctors && npm run dev                  # localhost:4321 — doctors
cd sites/content && npm run dev                # localhost:4321 — hub
```

## Design guarantees

- Nothing publishes without passing the humaniser (OpenAI rewrite against the Wikipedia AI-writing rubric)
- Reviews are only ever summaries of real, platform-attributed public reviews (FTC fake-review rule)
- Velocity-capped publishing to stay clear of Google's scaled-content-abuse classification
- Every stage logs to `pipeline/logs/`
- The orchestrator commits locally; you manually `git push` when ready
- Clinic/doctor data verified against NPI registry + clinic's own site before publishing
- **Clinics site features:** three themes (clinical, lab, wellness), theme switcher, sticky nav, mobile-first, verified badges, rating chips, breadcrumbs

## Costs (monthly)

| Item | Cost | Notes |
|---|---|---|
| Exa API | ~$20–50 | News fetches 3×/day + city/state fetches |
| OpenAI (GPT-4o) | ~$30–60 | Writing + humanising (~6 posts/day) |
| Gemini images | ~$0–15 | Optional, ~$0.01 per image |
| Vercel Hobby (3 sites) | **$0** | Free tier — 100GB bandwidth, 6000 build minutes per site |
| Supabase | **$0** | Free tier (already connected) |
| **Total** | **~$50–125/mo** | Lower end if using gpt-4o-mini for humanising |

## More docs

- `CLAUDE.md` — editorial constitution (hard rules every agent follows)
- `ARCHITECTURE.md` — deep dive on database, Supabase integration, costs, multi-site architecture
- `REVIEW.md` — gap analysis, roadmap, risk assessment
- `DESIGN-PROMPT.md` — UI/UX design system specification (tokens, themes, components)
- `peptide-seo-plan.md` — original strategy document
