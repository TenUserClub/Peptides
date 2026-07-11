# Architecture Review — Peptide SEO Engine (Kimi + OpenAI)

*Review date: 2026-07-11*

---

## 1. What has been built (status: complete)

### New Architecture

| Component | File | Purpose |
|---|---|---|
| **Orchestrator** | `pipeline/orchestrator.mjs` | Single entry point replacing 11 Claude agents. Manages fetch→write→humanise→publish→monitor chain |
| **LLM client** | `pipeline/lib/llm.mjs` | OpenAI chat completions + Gemini image generation wrappers |
| **Image engine** | `pipeline/lib/images.mjs` | Context-aware prompt templates per content type (news, clinics, doctors, legal, updates, social). Safety-first: no faces, no medical claims, no identifiable people |
| **Updated configs** | `site/astro.config.mjs`, `site/src/layouts/Base.astro`, `site/src/content.config.ts`, `site/src/pages/*.astro` | Vercel free domain, Open Graph meta tags, image fields in all schemas, featured image display on posts and cards |
| **Queue system** | `pipeline/queue/{cities,states,keywords}.json` | 20 cities, 10 states, 4 seed keywords — ready to run |

### Image Generation System (new)

**6 prompt templates** — each with detailed, content-type-specific context:

| Type | Prompt focus | Safety enforced |
|---|---|---|
| `news` | Abstract scientific visualization, editorial illustration | No faces, no procedures, no claims |
| `clinics` | Modern clinic interior, welcoming professional space | No faces, no syringes, no brands |
| `doctors` | Abstract medical expertise, professional aesthetic | No faces, no procedures, no brands |
| `legal` | Government/policy aesthetic, authoritative feel | No faces, no official seals |
| `updates` | Calendar/timeline summary visualization | No faces, no text overlays |
| `social` | Bold thumbnail for social sharing (OG image) | No faces, no claims, no logos |

**Images stored:** `site/public/images/{type}/{slug}.jpg` — served statically by Vercel
**OG tags:** Full Open Graph + Twitter Card meta tags on every page with image support

---

## 2. What's missing (gaps & improvements)

### A. Pipeline stages (currently stubbed)

| Stage | Status | Risk |
|---|---|---|
| `write-clinics` | Stub — needs verified data | Medium: can't publish clinic content yet |
| `write-doctors` | Stub — needs verified data | Medium: can't publish doctor content yet |
| `write-updates` | Stub — needs published posts | Low: weekly digest, not critical for launch |
| `verify` | Stub — NPI verification exists but not integrated | High: publishing unverified clinic/doctor data is the biggest legal risk |

**Recommendation:** Implement `verify` + `write-clinics` before the first clinic pipeline run. The NPI script (`npi-verify.mjs`) already works; the orchestrator just needs to wire it into the flow.

### B. Image generation gaps

| Issue | Impact | Fix |
|---|---|---|
| No OG image generation for social sharing | Social shares will be text-only | Add `generateAllImages` call in write-news to also create `-og` variants |
| Images are not generated during humanise/publish | If image fails during write, the post publishes without one | Move image generation to publish stage as fallback, or validate images exist before publishing |
| No image alt text optimization | Accessibility & SEO impact | Generate descriptive alt text via OpenAI based on post content |
| No image compression/optimization | Vercel free tier has bandwidth limits | Add sharp or imagemin pipeline, or use Vercel Image Optimization (Pro plan) |
| No fallback image for posts without generation | Broken image references if Gemini fails | Add a default placeholder image |

### C. Content & SEO improvements

| Issue | Impact | Fix |
|---|---|---|
| No RSS feed | Missing feed subscribers, Google Discover eligibility | Add `site/src/pages/rss.xml.ts` Astro endpoint |
| No robots.txt | Crawlers may waste budget on non-content pages | Add `site/public/robots.txt` with sitemap reference |
| No analytics | Can't measure traffic or conversion | Add Plausible (privacy-friendly, $9/mo) or Google Analytics 4 |
| No internal linking automation | Missed SEO opportunity for hub pages | Add automatic "related posts" and "next/prev" links |
| No sitemap auto-submission | GSC won't know about new posts automatically | Add GSC indexing API integration (optional) |
| Missing author bylines | E-E-A-T signal for YMYL content | Add `author` field to schemas, use "Peptide Directory Editorial Team" |
| No reading time estimate | UX improvement, minor SEO signal | Add `readingTime` to frontmatter or compute in templates |
| Static meta descriptions for index pages | Same description on all hub pages | Generate unique descriptions per index page |

### D. Reliability & operations

| Issue | Impact | Fix |
|---|---|---|
| No retry with exponential backoff for LLM calls | OpenAI rate limits or transient failures kill the run | Add `retryWithBackoff` wrapper around `chat()` |
| No circuit breaker for Exa API | Repeated failures waste API budget | Add circuit breaker: 3 failures → skip for 1 hour |
| No content quality scoring | Bad posts might slip through | Add OpenAI-based quality check: score 1-10, reject < 6 |
| No duplicate detection across collections | A news story and a legal post about the same topic could both publish | Cross-collection deduplication before writing |
| No stale content re-verification | Clinic data gets outdated, doctors move | Implement the 90-day re-verify queue from `monitor.md` |
| Publisher doesn't push to remote | Requires manual `git push` | Could add optional auto-push with `GIT_PUSH=true` flag |
| No backup of generated content | Data loss if repo corrupted | Add daily zip backup of `site/src/content/` |

### E. Monetization & growth (deferred, but worth noting)

| Feature | Value | When to add |
|---|---|---|
| Lead-gen forms ("Request consultation") | Primary revenue model | After 100 organic visits/day |
| Affiliate disclosures | FTC compliance if adding links | Before any affiliate partnership |
| Newsletter signup | Captures returning visitors | After 10 published posts |
| Compound pillar pages ("Complete guide to GLP-1") | Dominates head keywords | After 50 supporting posts exist |
| Schema.org `BreadcrumbList` | Better SERP appearance | Low effort, can add now |
| FAQ schema on clinic pages | Rich snippets | Low effort, can add now |

---

## 3. Recommended next steps (priority order)

### Phase 1 — Validate the news engine (do this first)

1. **Fill `.env`** with `EXA_API_KEY` and `OPENAI_API_KEY` (copy from `.env.example`)
2. **Run supervised test:**
   ```powershell
   node pipeline\orchestrator.mjs fetch-news
   node pipeline\orchestrator.mjs write-news
   node pipeline\orchestrator.mjs humanise
   node pipeline\orchestrator.mjs publish
   ```
3. **Verify:** Check `site/src/content/news/` for a real post, check `site/public/images/news/` for a generated image, run `npm run build` in `site/`
4. **Push to GitHub + Vercel:** Get the free `*.vercel.app` domain, update `SITE_DOMAIN` in `.env`

### Phase 2 — Harden before going autonomous

5. **Add retry logic** to `pipeline/lib/llm.mjs` (exponential backoff for 429/5xx)
6. **Add default placeholder image** to `site/public/images/placeholder.jpg`
7. **Add RSS feed** (`site/src/pages/rss.xml.ts`)
8. **Add robots.txt**
9. **Implement verify stage** (wire `npi-verify.mjs` into the orchestrator)
10. **Implement write-clinics** (after verify produces verified data)

### Phase 3 — Autonomous operation

11. **Set up Kimi cron** — every 6 hours, runs `node pipeline\orchestrator.mjs all`
12. **Monitor for 7 days** — check `pipeline/logs/daily-summary.md`, review humaniser diffs
13. **Raise velocity caps** only after GSC shows healthy indexing (30+ days)

### Phase 4 — Growth & polish

14. **Design overhaul** — execute `DESIGN-PROMPT.md` (three themes)
15. **Add analytics** (Plausible or GA4)
16. **Add newsletter signup** (ConvertKit or Beehiiv free tier)
17. **Expand queues** — add 50 more cities, 20 more states
18. **Add pillar pages** — compound content for head keywords

---

## 4. Cost estimate (monthly, revised)

| Item | Cost | Notes |
|---|---|---|
| Exa API | $20–50 | News fetches 3×/day + city/state fetches |
| OpenAI (GPT-4o) | $30–60 | Writing + humanising (~$0.03–0.05 per post, ~6 posts/day) |
| Gemini images | $0–15 | Optional, ~$0.01 per image |
| Vercel Hobby | $0 | Free tier, non-commercial |
| DataForSEO | $0–50 | Optional at start |
| Plausible analytics | $0–9 | Optional, free tier available |
| **Total** | **$50–185/mo** | Lower end if using gpt-4o-mini for some stages |

**Cost optimization:** Use `gpt-4o-mini` for humanising (it's a rewrite task, not reasoning) and `gpt-4o` only for writing. Saves ~40%.

---

## 5. Architecture strengths (keep these)

1. **File-based handoffs** — each stage reads from/writes to known directories. No state machine, no database. Simple to debug.
2. **Velocity caps** — hard limits prevent scaled-content-abuse penalties. The cap is enforced in the publisher, not the writer.
3. **Humaniser as mandatory gate** — Every draft must pass style rewrite before publish. This is the single best defense against AI-content detection.
4. **NPI verification** — Before any named doctor appears on the site, their credentials are checked against a government registry. This is the biggest legal risk reducer.
5. **Kimi orchestrator + OpenAI workers** — The orchestrator is lightweight Node.js; the heavy LLM work is delegated. Easy to swap models or add providers.

---

## 6. Biggest risks to watch

| Risk | Likelihood | Mitigation |
|---|---|---|
| Exa returns poor-quality results for a city | Medium | Skip empty/low-quality batches; the queue has stale detection |
| OpenAI generates treatment claims despite rules | Medium | The humaniser catches many; add a pre-publish safety regex for banned verbs |
| Gemini generates images with medical claims | Low | Prompts explicitly forbid this; add image review step before publish |
| Google flags site for AI content | Medium-Low | Humaniser + velocity caps + real sources + E-E-A-T signals (author, citations) |
| Vercel free tier limits | Low | 100GB bandwidth/mo is generous for a text-heavy site; images are the risk |
| FTC enforcement for fake reviews | Very Low | Zero invented reviews policy + platform attribution + correction mechanism |

---

## Files changed in this session

- **Created:** `pipeline/lib/llm.mjs`, `pipeline/lib/images.mjs`, `pipeline/orchestrator.mjs`
- **Modified:** `site/astro.config.mjs`, `site/src/layouts/Base.astro`, `site/src/content.config.ts`, `site/src/pages/index.astro`, `site/src/pages/news/[...id].astro`, `site/src/pages/clinics/[...id].astro`, `site/src/pages/legal/[...id].astro`, `site/src/pages/contact.astro`, `site/src/layouts/Base.astro`, `.env.example`, `README.md`, `NEEDS-HUMAN.md`
