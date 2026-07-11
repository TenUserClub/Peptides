# Architecture Deep Dive — Database, Costs & Supabase

*For the Peptide SEO Engine — Kimi + OpenAI + Supabase (optional)*

---

## 1. What is DataForSEO?

**DataForSEO** is a commercial API that searches Google on your behalf and tells you where your website ranks for specific keywords.

### How it works in our pipeline

```
You send:    { keyword: "peptide clinic miami", location: "US", depth: 100 }
DataForSEO:  { position: 12, url: "https://your-site.com/clinics/miami/..." }
```

The `pipeline/scripts/rank-track.mjs` script does exactly this every day:
1. Reads keywords from `pipeline/queue/keywords.json`
2. Calls DataForSEO for each keyword
3. Appends results to `pipeline/data/rankings.csv`

### Do you need it?

**No — not at the start.** The script is designed to skip gracefully if `DATAFORSEO_LOGIN` is missing. You can add it later when:
- You have 50+ published posts
- You care about tracking keyword positions over time
- You want to prove ROI on the content investment

**Free alternative:** Google Search Console (free) shows you which queries bring traffic and your average position. It doesn't track specific keywords on a schedule, but it's enough for the first 3-6 months.

### Cost

- Pay-as-you-go pricing
- $50 credit lasts ~3-6 months at our usage (4 keywords × 30 days = 120 queries/mo)
- Can skip entirely until you're ready

---

## 2. Where is the database hosted right now?

**Nowhere. There is no database.**

The entire pipeline is file-based by design:

| What | Where | Format |
|---|---|---|
| Blog content | `site/src/content/{news,clinics,doctors,legal,updates}/` | Markdown + YAML frontmatter |
| Work queues | `pipeline/queue/{cities,states,keywords}.json` | JSON |
| Raw research | `pipeline/data/exa/{news,clinics,doctors}/` | JSON |
| Verified records | `pipeline/data/verified/{clinics,doctors}/` | JSON |
| Rankings | `pipeline/data/rankings.csv` | CSV |
| Logs | `pipeline/logs/*.log` | Plain text |

### Why no database was the right call initially

- **Zero setup:** No connection strings, no migrations, no schema drift
- **Git-native:** Content is version-controlled automatically
- **Astro-native:** Astro's content collections read markdown files directly
- **Offline-first:** The pipeline runs entirely on your laptop with no internet except for API calls

### Why a database becomes useful now

- **Query power:** "Show me all clinics in Florida with GLP-1 services and 4.5+ stars" — trivial in SQL, hard in JSON files
- **Analytics:** "Which city produces the most verified clinics?" — SQL aggregation vs. custom JS
- **Reliability:** JSON files can corrupt. Postgres transactions are atomic.
- **Dashboard:** A simple Supabase dashboard lets you see pipeline health without reading log files
- **Backup:** Supabase auto-backups vs. relying on git alone

---

## 3. Supabase Integration — Free Tier Architecture

### What Supabase gives us (free forever)

| Feature | Free Tier Limit | Our Usage |
|---|---|---|
| Postgres database | 500MB | ~1MB (200 clinics + 1,000 posts + rankings) |
| Bandwidth | 2GB/mo | ~50MB/mo (tiny API calls) |
| File storage | 1GB | Unused (images stay in repo) |
| Edge Functions | 500K invocations | Unused (orchestrator runs locally) |
| API requests | Unlimited | ~100/day |
| **Cost** | **$0** | **$0** |

### Architecture with Supabase (optional — pipeline works without it)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Kimi Cron     │────▶│  Orchestrator   │────▶│   OpenAI API    │
│  (every 6h)     │     │  (Node.js)      │     │  (GPT-4o)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │  Supabase DB    │◄── Optional but recommended
         │              │  (Postgres)     │    for queues, records,
         │              │  - clinics      │    rankings, run logs
         │              │  - doctors      │
         │              │  - posts        │
         │              │  - rankings     │
         │              │  - queue_state  │
         │              └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Git + Vercel   │◄────│  Markdown files │
│  (free hosting) │     │  (site/src/content/)
└─────────────────┘     └─────────────────┘
```

### What stays in files (unchanged)

- **Markdown content** → `site/src/content/` (Astro needs this)
- **Images** → `site/public/images/` (served by Vercel CDN)
- **Pipeline scripts** → `pipeline/scripts/` (local execution)

### What moves to Supabase (optional enhancement)

- **Verified clinic/doctor records** → `clinics` and `doctors` tables
- **Published post metadata** → `posts` table (title, slug, URL, publish date, tags)
- **Rank tracking** → `rankings` table (queryable trends over time)
- **Queue state** → `queue_state` table (atomic updates, no JSON corruption)
- **Pipeline audit log** → `pipeline_runs` table (see every run, every failure)

### The migration is non-destructive

The orchestrator checks for `SUPABASE_URL` in `.env`:
- **If set:** Reads/writes queues and records from Supabase. Falls back to files if Supabase is unreachable.
- **If not set:** Uses files exactly as before. No breakage.

You can add Supabase **after** the pipeline is running. No rush.

---

## 4. Cost Breakdown — Everything Free Except API Credits

### Paid (you already have credits)

| Service | Usage | Cost |
|---|---|---|
| **Exa API** | News fetches 3×/day + city/state fetches | ~$20–50/mo |
| **OpenAI (GPT-4o)** | Writing + humanising (~6 posts/day) | ~$30–60/mo |
| **Gemini** | Image generation (~6 images/day) | ~$0–15/mo |
| **Total API** | | **~$50–125/mo** |

### Free (no credit card needed)

| Service | What you get | Cost |
|---|---|---|
| **Vercel Hobby** | 100GB bandwidth, 6000 build minutes, custom domain | **$0** |
| **Supabase** | 500MB Postgres, 2GB bandwidth, unlimited API calls | **$0** |
| **GitHub** | Unlimited private repos | **$0** |
| **Google Search Console** | Traffic data, indexing status, keyword insights | **$0** |
| **NPI Registry** | Doctor verification API | **$0** (government API) |
| **Total Hosting** | | **$0** |

### Grand total

**$50–125/mo** for API usage (Exa + OpenAI + optional Gemini)
**$0/mo** for hosting, database, and infrastructure

**Cost optimization tip:** Use `gpt-4o-mini` for the humaniser stage. It's a rewrite task, not reasoning. Saves ~40% on OpenAI costs with negligible quality loss.

---

## 5. Do you need Supabase right now?

### Start without it (Phase 1)

Run the news pipeline with just `.env` + `EXA_API_KEY` + `OPENAI_API_KEY`. The file-based system works. Monitor via `pipeline/logs/daily-summary.md`.

### Add Supabase when (Phase 2)

- You have 20+ verified clinics and need to query them
- You want a dashboard instead of reading log files
- You're ready to scale to 50+ cities
- You want trend charts for keyword rankings

### The Supabase setup is already done

I've created:
- `supabase/migrations/001_initial_schema.sql` — Full schema with indexes, RLS policies, comments
- `pipeline/lib/db.mjs` — Client wrapper with helper functions for every table

You just need to:
1. Create a free Supabase project (I can do this for you — it's $0)
2. Run the migration
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to `.env`

---

## 6. Files created in this session

| File | Purpose |
|---|---|
| `pipeline/lib/llm.mjs` | OpenAI chat + Gemini image wrappers |
| `pipeline/lib/images.mjs` | 6 content-type prompt templates for image generation |
| `pipeline/lib/db.mjs` | Supabase client — optional, graceful fallback to files |
| `pipeline/orchestrator.mjs` | Full pipeline orchestrator (fetch→write→humanise→publish→monitor) |
| `supabase/migrations/001_initial_schema.sql` | Postgres schema: clinics, doctors, posts, rankings, queues, runs |
| `.env.example` | Updated with all keys: Exa, OpenAI, Gemini, Supabase, DataForSEO |
| `REVIEW.md` | 12 gaps found, 4-phase roadmap, risk assessment |
