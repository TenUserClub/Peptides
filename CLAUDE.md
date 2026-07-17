# Peptide Atlas editorial constitution

Every automated stage and human contributor must follow these rules. When a prompt conflicts with this file, this file wins.

## Scope

Peptide Atlas operates six content collections across five sites: clinics, doctors, blog, legal, news, and weekly updates. The orchestrator is `pipeline/orchestrator.mjs`. Content moves through fetched data, verified records, drafts, humanised drafts, deterministic validation, and the appropriate Astro collection.

```text
clinics -> site/src/content/clinics/
doctors -> sites/doctors/src/content/doctors/
blog, legal -> sites/content/src/content/<collection>/
news -> sites/news/src/content/news/
updates -> sites/updates/src/content/updates/
```

Do not skip a stage. Never fabricate input when an upstream directory is empty. Dry runs must not advance queues, write processed markers, move content, commit, or push.

## Hard editorial rules

1. Never invent reviews, testimonials, quotes, ratings, opinions, credentials, addresses, services, or outcomes.
2. A review summary must include its platform and verified figures. If that data is missing, say substantial public reviews were not found.
3. Never say a peptide cures, heals, treats, fixes, reverses, or prevents a condition unless accurately quoting and clearly contextualising an authoritative regulatory source. Prefer neutral descriptions.
4. Do not promote products labelled for research use, not for human consumption, or sold by research-chemical vendors.
5. Never imply that a compounded product is FDA-approved or equivalent to an approved drug.
6. News and legal articles require a reachable authoritative primary source. Blog articles require at least two authoritative sources.
7. Clinic posts require a matching verified first-party record. Doctor profiles require a matching verified NPI record. Roundups require matching records for listed doctors and a visible methodology.
8. Every article must identify its author. Add `reviewedBy` when a qualified human has reviewed it. Do not invent reviewers.
9. The layouts must retain the medical disclaimer and correction route. Sources and methodology cannot be visually de-emphasised.
10. Do not use em dashes in public-facing copy.

## Authoritative sourcing

Prefer official government sources, recognised academic institutions, clinical trial registries, peer-reviewed journals, and court records. Search snippets, commercial blogs, press rewrites, and social posts are discovery material, not primary evidence. Use the first-party page and preserve the exact URL in frontmatter.

## Writing style

Write in plain US English. Lead with the useful fact. Vary sentence and paragraph length naturally. Avoid rhetorical hype, fake certainty, canned conclusions, repetitive transitions, vague attribution, and decorative jargon. Explain uncertainty where the evidence is limited.

## Humaniser limits

The humaniser may improve rhythm, clarity, and repetition. It may not add or remove facts, citations, names, figures, caveats, methodology, or frontmatter. A humanised draft must still pass `pipeline/lib/content-guard.mjs`.

## Velocity limits

Publish no more than five combined clinic and doctor posts per day and no more than three combined news and legal posts per day. Leave excess in `pipeline/humanised/`. Do not advance a city or state queue until its verified batch has fully published.

## Withdrawal and correction

Withdraw content that cannot be supported, then preserve it under a dated directory in `pipeline/quarantine/` for audit. Do not silently restore withdrawn files. Corrections should record what changed, why it changed, and the supporting source.
