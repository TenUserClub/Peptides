# Architecture Deep Dive — Multi-Site, Database, Costs & Supabase

*For the Peptide SEO Engine — Kimi + OpenAI + Supabase*

---

## 1. Multi-site architecture

The project is split into three separate Astro sites, each deployed to its own Vercel domain:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Clinics Site   │     │  Doctors Site   │     │  Content Hub    │
│  site/          │     │  sites/doctors/ │     │  sites/content/ │
│  peptide-       │     │  peptide-       │     │  peptide-       │
│  clinics.       │     │  doctors.       │     │  hub.           │
│  vercel.app     │     │  vercel.app     │     │  vercel.app     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │            ┌──────────┴──────────┐            │
         └────────────┤   Cross-domain nav  ├────────────┘
                      │   (sections.ts)       │
                      └───────────────────────┘
```

### Why multi-site?

- **SEO focus:** Each domain targets a specific keyword cluster (clinics, doctors, news/guides)
- **User clarity:** Visitors land on a focused experience, not a generic portal
- **Scaling independence:** Each site can be styled, deployed, and scaled independently
- **Vercel free tier:** Three separate Hobby deployments are still $0

### Content routing

| Content | Source directory | Target site |
|---|---|---|
| Clinics | `site/src/content/clinics/` | Clinics site |
| Doctors | `sites/doctors/src/content/doctors/` | Doctors site |
| Blog | `sites/content/src/content/blog/` | Content hub |
| News | `sites/content/src/content/news/` | Content hub |
| Legal | `sites/content/src/content/legal/` | Content hub |
| Updates | `sites/content/src/content/updates/` | Content hub |

### Cross-domain navigation

Each site's navbar links to the other sites via absolute URLs. The `SITES` constant in each `src/lib/sections.ts` defines the domain mapping:

```ts
export const SITES = {
  clinics: 'https://peptide-clinics.vercel.app',
  doctors: 'https://peptide-doctors.vercel.app',
  content: 'https://peptide-hub.vercel.app',
};
```

Update these to your actual Vercel domains after first deploy.

---

## 2. Rank tracking (deferred)

**Status: Not implemented.** We track rankings via Google Search Console (free) for now. A commercial rank-tracking API may be added later when:

- You have 50+ published posts
- You care about tracking keyword positions over time
- You want to prove ROI on the content investment

**Free alternative:** Google Search Console shows you which queries bring traffic and your average position. It's enough for the first 3-6 months.

---

## 3. Where is the database?

**Supabase — connected and working.**

Project: `zfwszjbaiqpximishnco` at `https://zfwszjbaiqpximishnco.supabase.co`

The pipeline is primarily file-based (markdown content in each site's `src/content/`), but Supabase backs the operational data:

| What | Where | Format |
|---|---|---|
| Blog content | `site/src/content/clinics/` + `sites/{doctors,content}/src/content/` | Markdown + YAML frontmatter |
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

## 4. Supabase Integration — Free Tier Architecture

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
│  3 sites        │     │  (sites/*/src/content/)
└─────────────────┘     └─────────────────┘
```

### What stays in files (unchanged)

- **Markdown content** → `site/src/content/` + `sites/*/src/content/` (Astro needs this)
- **Images** → `site/public/images/` + `sites/*/public/images/` (served by Vercel CDN)
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

## 5. Cost Breakdown — Everything Free Except API Credits

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
| **Vercel Hobby (×3)** | 100GB bandwidth, 6000 build minutes, custom domain per site | **$0** |
| **Supabase** | 500MB Postgres, 2GB bandwidth, unlimited API calls | **$0** |
| **GitHub** | Unlimited private repos | **$0** |
| **Google Search Console** | Traffic data, indexing status, keyword insights | **$0** |
| **NPI Registry** | Doctor verification API | **$0** (government API) |
| **Total Hosting** | | **$0** |

### Grand total

**$50–125/mo** for API usage (Exa + OpenAI + optional Gemini)
**$0/mo** for hosting, database, and infrastructure (3 Vercel sites + Supabase)

**Cost optimization tip:** Use `gpt-4o-mini` for the humaniser stage. It's a rewrite task, not reasoning. Saves ~40% on OpenAI costs with negligible quality loss.

---

## 6. Do you need Supabase right now?

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

## 7. Key files

| File | Purpose |
|---|---|
| `pipeline/lib/llm.mjs` | OpenAI chat + Gemini image wrappers with retry logic |
| `pipeline/lib/images.mjs` | 6 content-type prompt templates for image generation |
| `pipeline/lib/db.mjs` | Supabase client — optional, graceful fallback to files |
| `pipeline/orchestrator.mjs` | Full pipeline orchestrator (fetch→write→humanise→publish→monitor) |
| `supabase/migrations/001_initial_schema.sql` | Postgres schema: clinics, doctors, posts, rankings, queues, runs |
| `.env.example` | All keys: Exa, OpenAI, Gemini, Supabase |
| `site/src/styles/global.css` | Design tokens + 3 themes (clinical, lab, wellness) |
| `site/src/layouts/Base.astro` | Clinics layout with theme switcher, sticky nav, cross-domain links |

---

## 8. UI/UX Design System

The clinics site implements a full design system per `DESIGN-PROMPT.md`:

- **Three themes:** `clinical` (light, default), `lab` (dark), `wellness` (warm light)
- **Theme switcher:** Fixed bottom-left button, cycles themes, persisted in `localStorage`, zero flash-of-wrong-theme
- **Design tokens:** CSS custom properties for colors, typography, spacing, radii, shadows
- **Typography:** Fluid type scale via `clamp()`, reading measure ~70ch, system font stack
- **Components:** sticky header, verified badge, rating chip, breadcrumbs, methodology box, CTA, filters
- **Mobile-first:** responsive nav toggle, card grids, filter layouts
- **Performance:** <1KB JS (theme switcher + nav toggle), CSS-only design, no client framework
