# Peptide Atlas architecture

## System boundary

Peptide Atlas is one repository with three independently deployed Astro sites and one file-based content pipeline.

| Concern | Clinics | Doctors | Journal |
| --- | --- | --- | --- |
| Directory | `site/` | `sites/doctors/` | `sites/content/` |
| Content | `src/content/clinics/` | `src/content/doctors/` | `src/content/{blog,news,legal,updates}/` |
| Vercel host | `peptides-three-phi.vercel.app` | `peptides-doctors-and-experts.vercel.app` | `peptides-content.vercel.app` |

Each project has its own canonical site URL, sitemap, robots file, 404 page, and build. Shared top navigation uses absolute URLs so moving between projects never resolves against the wrong host.

## Content flow

```text
queues -> fetched source data -> verified records -> drafts -> humanised -> content guard -> site content -> Astro build
```

The orchestrator owns state transitions. Queue pointers advance only after the corresponding verified batch has published. Dry runs may log intended work but must not advance queues or write processed markers.

## Publication guard

`pipeline/lib/content-guard.mjs` is the deterministic publication gate. It checks required frontmatter, collection-specific word ranges, prohibited claims, authoritative sources, sample filenames, placeholder domains, cross-site links, and matching verified records for clinics and doctors. Model-based writing and humanising do not replace this gate.

News and legal posts must use an authoritative primary source. Blog posts need at least two authoritative sources. Clinic listings require a matching verified clinic record. Doctor profiles require a matching NPI record; roundups require a methodology and matching verified records.

## Verification model

Clinic verification requires a reachable first-party website that mentions an in-scope service. Doctor verification additionally requires an NPI result and a usable physician identity. Search snippets alone are not proof. Public review data may be used only when the platform and figures are present in the verified record.

## Storage

Markdown, JSON, and logs are the current source of truth. `pipeline/lib/db.mjs` and the Supabase migration are optional foundations, not an active replacement for file state in the orchestrator. Enabling Supabase credentials only initialises the helper; it does not move the main workflow into Postgres.

## Deployment

Vercel builds each Astro project from its own root. A local publish creates a git commit. A push only occurs when `AUTO_PUSH=true`; failed pushes retry twice and leave the local commit intact. No custom domain assumptions are encoded yet.

## Automation and checks

`.github/workflows/ci.yml` runs tests and builds all sites on pushes and pull requests. `.github/workflows/pipeline.yml` can run the orchestrator every six hours after repository secrets are configured. `pipeline/scripts/check-sites.mjs` inspects built output for placeholder or sample content, em dashes, broken internal links, robots mistakes, and shared stylesheet drift.

## Shared presentation

The layouts are intentionally separate because their active section and footer wording differ. The canonical stylesheet is maintained in `sites/doctors/public/styles/global.css` and copied byte-for-byte to the other two projects. The integrity check rejects drift. All layouts expose four persisted themes and use the current Vercel URLs from `src/lib/sections.ts`.

## Future custom domains

When domains are attached in Vercel, update:

1. `site/astro.config.mjs`, `sites/doctors/astro.config.mjs`, and `sites/content/astro.config.mjs`.
2. The `SITES` map in each `src/lib/sections.ts`.
3. Each robots sitemap URL.
4. The weekly review domain map in `pipeline/orchestrator.mjs`.
5. The live-site table in `README.md`.

Run `npm run check` before deployment.
