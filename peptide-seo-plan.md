# Peptide SEO — Autonomous Blog Engine Plan (v2)

*Updated July 7, 2026 · Scope realigned to the four content engines · Phases 3/4 (productization) deferred*

---

## 1. Scope — exactly four engines + humaniser

| Engine | What it does | Cadence |
|---|---|---|
| **Peptides Clinics** | Exa fetches clinics offering peptides in each US city → one blog per clinic: Reviews, About the Doctor, Services offered | City-by-city queue, continuous |
| **Peptides News** | Exa fetches latest peptide news → blog per story | 2–3 blogs/day |
| **Peptides Doctors** | Exa fetches doctors by US city/state → roundup + profile blogs (e.g., "Top 10 Doctors for GLP-1 in Florida") | State-by-state queue, continuous |
| **Peptides Updates** | Combines clinics + news + doctors into digest posts | Weekly (or as material accumulates) |

**Every blog passes through the Humaniser agent before publishing** (see §3).

## 2. Pipeline (runs 24/7 on your laptop via scheduled Claude Code agents)

| # | Stage | Schedule | Detail |
|---|---|---|---|
| 1 | **Exa fetch — news** | Every 8h | Last-24h peptide news → `data/exa/news/` |
| 2 | **Exa fetch — clinics** | Daily 02:00 | Next city in `queue/cities.json` → clinic list + details → `data/exa/clinics/` |
| 3 | **Exa fetch — doctors** | Daily 02:30 | Next state/city → doctor list (GLP-1, HRT, longevity specialties) → `data/exa/doctors/` |
| 4 | **Fact verify** | Daily 03:00 | Clinic/doctor data cross-checked vs NPI registry + the clinic's own site; unverifiable entries dropped. News checked against primary source. |
| 5 | **Writer — clinics** | Daily 04:00 | Blog per verified clinic. Sections: overview, **Reviews** (summarized from real public reviews, platform-attributed: "patients on Google (4.8★, 120 reviews) mention…"), **About the Doctor** (verified credentials), **Services** (from clinic's own listings). |
| 6 | **Writer — doctors** | Daily 04:30 | "Top N doctors for X in {state}" roundups + profiles. Methodology line on every roundup (how the list was compiled). |
| 7 | **Writer — news** | After each news fetch | 2–3 posts/day, primary source cited, no treatment claims. |
| 8 | **Writer — updates** | Sun 05:00 | Weekly digest linking the week's clinic, doctor, and news posts (internal-link hub). |
| 9 | **Humaniser** | After every draft | Strips AI style — see §3. Final gate before publish. |
| 10 | **Publisher** | On humaniser pass | Git commit → Astro site auto-deploys (Vercel). Schema: `LocalBusiness`/`Physician` on directory posts, `NewsArticle` on news. Sitemap + internal links updated. |
| 11 | **Monitor** | Daily 06:00 | GSC + DataForSEO rank logging → `data/rankings.csv`; flags stale clinic/doctor pages for re-verification every 90 days. |

File-based handoffs (`queue/` → `data/` → `drafts/` → `published/`), each stage a headless `claude -p` invocation triggered by Windows Task Scheduler. `CLAUDE.md` holds shared rules so every agent inherits them.

## 3. Humaniser agent spec

Purpose: remove AI writing style before publish. Its instructions embed the rubric from [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) as a negative-example checklist, including:

- Puffery and significance inflation: "stands as a testament," "rich tapestry," "plays a vital role," "nestled in the heart of"
- "Not just X, but Y" constructions; rule-of-three overuse; antithesis padding
- Essay-style intros and empty summarizing conclusions ("In conclusion, …", "Overall, …")
- Em-dash overload, title-case headings, bullet-point bloat, bold-term sprinkling
- Uniform sentence/paragraph rhythm; hedging stacks ("it's important to note")
- Vague attributions ("many experts believe") — replace with the actual source or cut

Behavior: rewrite for varied rhythm and plain language, cut filler, **never alter facts, names, numbers, or attributions**. Output diff is saved so you can spot-check. The agent re-reads the Wikipedia page monthly (it's a living document) and updates its checklist.

## 4. Site structure

```
/clinics/{state}/{city}/{clinic-slug}/      ← clinic blogs
/doctors/{state}/top-{specialty}/           ← roundups (e.g. /doctors/florida/top-glp1/)
/doctors/{state}/{doctor-slug}/             ← doctor profiles
/news/{yyyy}/{slug}/                        ← news blogs
/updates/{yyyy}-w{ww}/                      ← weekly digests
```

One domain, one Astro site, content as markdown. Clinic and doctor pages carry a "request consultation" CTA — the monetization surface when you're ready.

## 5. Non-negotiable guardrails (kept from v1, minimal set)

1. **Reviews are summarized, never invented.** Real public reviews only, always platform-attributed. The FTC fake-review rule explicitly covers AI-generated reviews; invented opinions about named doctors are also defamation exposure. Correction/removal contact link on every clinic/doctor page.
2. **Verification before publication** for anything naming a real person (stage 4). Wrong credentials on a named physician is the system's biggest legal risk.
3. **No treatment/cure claims; medical disclaimer on every post.** News posts report, not advise.
4. **Velocity ramp:** start ~3–5 directory posts/day + 2–3 news posts/day; scale only after Google Search Console shows healthy indexing. A flood of thin pages triggers scaled-content-abuse classification and takes the whole domain down with it.

## 6. Costs (monthly)

| Item | Cost |
|---|---|
| Domain + hosting (Vercel Hobby free tier; non-commercial — revisit at monetization) | ~$8 |
| Exa API (usage-based) | ~$20–50 |
| DataForSEO (rank tracking only, pay-as-you-go) | ~$50 top-up lasts months at this usage |
| Claude usage (existing plan; API if headless volume needs it) | $0–100 |
| **Total** | **~$30–160/mo** |

## 7. Build order

**Week 1 — Foundation:** buy domain → scaffold Astro site → write `CLAUDE.md` (editorial rules, humaniser rubric, guardrails) → Exa + GSC accounts → seed `queue/cities.json` (start with 10 high-value metros: Miami, Austin, Scottsdale, LA, Dallas, Tampa, Denver, Nashville, San Diego, Houston).

**Week 2 — News engine live:** stages 1, 7, 9, 10. Smallest loop, proves the fetch→write→humanise→publish chain end-to-end. Run supervised 3 days, then scheduled.

**Week 3 — Clinics engine live:** stages 2, 4, 5. First city fully published before the queue advances.

**Week 4 — Doctors + Updates engines live:** stages 3, 6, 8, 11. Full pipeline autonomous; your role drops to spot-checking humaniser diffs and GSC.

Deferred (revisit once traffic exists): compound pillar pages, regulatory tracker, lead monetization, productization/service model.

---

### Sources

- [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (humaniser rubric)
- [Google AI-content spam policies — INSIDEA](https://insidea.com/blog/seo/googles-spam-policies-for-ai-generated-content) · [YMYL guide — Search Engine Land](https://searchengineland.com/guide/ymyl)
- [FTC peptide advertising crackdown — PeptideLaws](https://peptidelaws.com/news/ftc-crackdown-peptide-advertising-social-media-influencer-compliance) · [FDA warning letters to 30 telehealth companies — Patient Care Online](https://www.patientcareonline.com/view/fda-issues-warning-letters-30-telehealth-companies-over-misleading-compounded-glp-1-ra-marketing)
- [FDA peptide regulations 2026 — PeptideLaws](https://peptidelaws.com/news/fda-peptide-regulations-2026) · [Pharmacy Times on the 2026 reclassification](https://www.pharmacytimes.com/view/the-peptide-reclassification-everyone-s-talking-about-a-pharmacist-s-take-on-what-rfk-jr-s-announcement-actually-means)
- [DataForSEO pricing](https://dataforseo.com/pricing/keywords-data)
