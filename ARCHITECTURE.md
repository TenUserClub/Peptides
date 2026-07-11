# Architecture Deep Dive — Database, Costs & Supabase

*For the Peptide SEO Engine — Kimi + OpenAI + Supabase*

---

## 1. Rank tracking (deferred)

**Status: Not implemented.** We track rankings via Google Search Console (free) for now. A commercial rank-tracking API may be added later when:

- You have 50+ published posts
- You care about tracking keyword positions over time
- You want to prove ROI on the content investment

**Free alternative:** Google Search Console shows you which queries bring traffic and your average position. It's enough for the first 3-6 months.

---

## 2. Where is the database?

**Supabase — connected and working.**

Project: `zfwszjbaiqpximishnco` at `https://zfwszjbaiqpximishnco.supabase.co`

The pipeline is primarily file-based (markdown content in `site/src/content/`), but Supabase backs the operational data:

| What | Where | Format |
|---|---|---|
| Blog content | `site/src/content/{news,clinics,doctors,legal,updates}/` | Markdown + YAML frontmatter |
| Work queues | `pipeline/queue/{cities,states,keywords}.json` | JSON |
| Raw research | `pipeline/data/exa/{news,clinics,doctors}/` | JSON |
| Verified records | `pipeline/data/verified/{clinics,doctors}/` | JSON |
| Clinic/doctor DB | Supabase `clinics` / `doctors` tables | Postgres |
| Post metadata | Supabase `posts` table | Postgres |
| Pipeline runs | Supabase `pipeline_runs` table | Postgres |
| Logs | `pipeline/logs/*.log` | Plain text |

### Why the hybrid approach works

- **Content stays in files:** Astro's content collections read markdown directly. Git gives us version control for free.
- **Operational data in Supabase:** Query power for "show me all clinics in Florida with GLP-1 services", atomic queue state, pipeline audit logs.
- **Graceful fallback:** If Supabase is unreachable, the orchestrator falls back to files automatically.

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

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Scheduler     │────▶│  Orchestrator   │────▶│   OpenAI API    │
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

### What moves to Supabase

- **Verified clinic/doctor records** → `clinics` and `doctors` tables
- **Published post metadata** → `posts` table (title, slug, URL, publish date, tags)
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

### Already connected (Phase 1)

Supabase is set up and working. The pipeline writes to it when credentials are present. If you remove the credentials, it falls back to files seamlessly.

### When Supabase becomes essential (Phase 2)

- You have 20+ verified clinics and need to query them
- You want a dashboard instead of reading log files
- You're ready to scale to 50+ cities
- You want trend charts for keyword rankings

### The Supabase setup is already done

- `supabase/migrations/001_initial_schema.sql` — Full schema with indexes, RLS policies, comments
- `pipeline/lib/db.mjs` — Client wrapper with helper functions for every table

---

## 6. Key files

| File | Purpose |
|---|---|
| `pipeline/lib/llm.mjs` | OpenAI chat + Gemini image wrappers with retry logic |
| `pipeline/lib/images.mjs` | 6 content-type prompt templates for image generation |
| `pipeline/lib/db.mjs` | Supabase client — optional, graceful fallback to files |
| `pipeline/orchestrator.mjs` | Full pipeline orchestrator (fetch→write→humanise→publish→monitor) |
| `supabase/migrations/001_initial_schema.sql` | Postgres schema: clinics, doctors, posts, rankings, queues, runs |
| `.env.example` | All keys: Exa, OpenAI, Gemini, Supabase |
