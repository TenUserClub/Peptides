# Peptide SEO Engine — Editorial Constitution

Every agent in this repo inherits these rules. They are non-negotiable and override any stage prompt if in conflict.

## What this repo is

An autonomous content pipeline with four engines: **Clinics** (directory per US city), **Doctors & experts** (roundups + profiles), **News** (2–3 posts/day; stories that are primarily laws/regulation/enforcement are routed to the site's **Laws & legal** section instead of News — same writer, same velocity cap), **Blog** (evergreen educational guides), and **Updates** (weekly digest). Data comes from the Exa API; every draft passes the Humaniser before publish. The pipeline is orchestrated by `pipeline/orchestrator.mjs` (Node.js), which delegates writing and humanising to OpenAI (GPT-4o). The site is Astro in `site/`, deployed via git push to Vercel.

## Directory contract

```
pipeline/queue/       cities.json, states.json — work queues (advance pointer only after a batch fully publishes)
pipeline/data/exa/    raw Exa results: news/, clinics/, doctors/  (JSON, one file per fetch, timestamped)
pipeline/data/verified/  fact-checked clinic/doctor records ready for writers
pipeline/data/rejected/  candidates that failed verification (JSON with a one-line reason each)
pipeline/drafts/      writer output awaiting humaniser: {engine}/{slug}.md
pipeline/humanised/   humaniser output awaiting publish (diff saved alongside as {slug}.diff.md)
site/src/content/     published markdown: clinics/, doctors/, news/, legal/, blog/, updates/
pipeline/logs/        one line per stage run: timestamp, stage, counts, errors
```

The orchestrator moves content through these directories: `data/exa/` → `drafts/` → `humanised/` → `site/src/content/`. Never skip a stage. If an upstream directory is empty, log and exit cleanly — do not fabricate input.

## Hard editorial rules (legal/compliance — never violate)

1. **Never invent reviews, testimonials, quotes, or opinions.** The Reviews section of a clinic/doctor post may only summarize real, existing public reviews and MUST attribute the platform and figures: "Patients on Google (4.8★ across 120 reviews) frequently mention…". If no public reviews are found, write "We could not find substantial public reviews for this clinic" — do not fill the gap.
2. **Real people, verified facts only.** Any credential, specialty, affiliation, or service attributed to a named doctor/clinic must come from `pipeline/data/verified/`. If a fact isn't in the verified record, omit it. Never guess a doctor's title, board certification, or education.
3. **No treatment claims.** Never state or imply a peptide cures, treats, heals, or prevents anything. Report what research or the source says, attributed ("a 2024 pilot study reported…"). Banned verbs applied to peptides: cures, heals, treats, fixes, reverses, prevents.
4. **Compounded ≠ FDA-approved.** Never imply equivalence. When relevant, note legal status accurately (several peptides are pending FDA compounding reclassification as of 2026 — link the FDA/HHS source, don't editorialize).
5. **Every post ends with the medical disclaimer** (the site layout injects it — never remove it) and every clinic/doctor post gets the correction-contact line (in the layout).
6. **"Top N" roundups must state methodology on-page** — one short paragraph: what sources were used (public directories, NPI registry, published patient ratings), what was ranked on, and that no doctor paid for placement.
7. **No affiliate links to research-chemical vendors. No links to "research use only" peptide sellers.** Ever.

## Writing style (before humaniser — write clean from the start)

- Grounded and specific. Every claim traceable to a source in the frontmatter `sources` list.
- US English, 8th–10th grade reading level, second person sparingly.
- Clinic posts: 700–1,100 words. Doctor roundups: 1,000–1,500. News: 400–700. Blog: 1,000–1,500. Digests: 500–800.
- Frontmatter must match the collection schema in `site/src/content.config.ts` exactly.

## Humaniser rubric (Stage 9 — full spec in pipeline/prompts/humanise.md)

Before each run, WebFetch https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing and apply it as a negative checklist. Baseline signs to eliminate (from that essay):

- **Puffery / significance inflation:** "stands as a testament", "rich tapestry", "plays a vital/pivotal role", "nestled in the heart of", "boasts", "vibrant", "a beacon of", "underscores its importance", "continues to captivate".
- **Formulaic constructions:** "not just X, but Y"; "it's not about X, it's about Y"; negative parallelisms; rule-of-three everywhere ("fast, friendly, and effective"); antithesis padding.
- **Essay scaffolding:** throat-clearing intros; conclusions that restate ("In conclusion", "Overall", "In summary", "Ultimately"); section-ending mini-summaries; "letter-like" sign-offs.
- **Hedging & filler:** "it's important to note", "it's worth mentioning", stacked qualifiers, "generally speaking".
- **Vague attribution:** "many experts believe", "studies show" without a citation, "industry reports suggest" — name the source or cut the claim.
- **Typographic tells:** em-dash overuse, excessive **bolding** of mid-sentence terms, Title Case Headings (use sentence case), bullet lists where prose reads better, emoji, curly-quote inconsistency, markdown artifacts.
- **Rhythm tells:** uniform sentence length and paragraph size; every paragraph 3–4 sentences. Vary deliberately — some one-sentence paragraphs, some long.
- **Cutoff/meta tells:** "as of [date]" without need, "while specific details are limited", any reference to being an AI or to information availability.

Humaniser NEVER changes facts, names, numbers, ratings, attributions, sources, or frontmatter. Style only. Save a diff for human spot-checking.

## Velocity limits

Max 5 directory posts/day + 3 news posts/day (news + legal combined — a legal post consumes a news slot) until `pipeline/logs/` shows 30 days of healthy GSC indexing. Do not batch-publish a backlog. If the publisher finds >8 items in `pipeline/humanised/`, publish the cap and leave the rest for tomorrow.

## Failure behavior

Log errors to `pipeline/logs/`, never retry more than twice, never publish anything that failed verification, and leave a note in `pipeline/logs/daily-summary.md` describing what's blocked.
