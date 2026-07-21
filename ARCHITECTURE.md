# Peptide Atlas architecture

## System boundary

Peptide Atlas is one repository with five independently deployed Astro sites and one file-based content pipeline.

| Project | Directory | Content | Public domain |
| --- | --- | --- | --- |
| Clinics | `site/` | `src/content/clinics/` | `mypeptide.club` |
| Doctors | `sites/doctors/` | `src/content/doctors/` | `toppeptideslist.com` |
| Safe Peptides | `sites/content/` | `src/content/{blog,legal}/` | `safepeptides.us` |
| News | `sites/news/` | `src/content/news/` | `peptidesnews.us` |
| Updates | `sites/updates/` | `src/content/updates/` | `peptidesupdates.com` |

Each project has its own canonical site URL, sitemap, robots file, 404 page, and build. Shared top navigation uses absolute URLs so moving between projects never resolves against the wrong host.

## Content flow

```text
topic and directory queues -> fetched source data -> verified records -> drafts -> humanised -> content guard -> site content -> Astro build
```

The orchestrator owns state transitions. Directory queue pointers advance only after the corresponding verified batch has published. Evergreen articles are selected deterministically from the highest-priority ready entry in `pipeline/queue/blog-topics.json`; a matching draft, humanised file, or published file prevents duplicate selection. Dry runs may log intended work but must not advance queues or write processed markers.

## Publication guard

`pipeline/lib/content-guard.mjs` is the deterministic publication gate. It checks required frontmatter, collection-specific word ranges, prohibited claims, authoritative sources, sample filenames, placeholder domains, cross-site links, and matching verified records for clinics and doctors. Model-based writing and humanising do not replace this gate.

News and legal posts must use an authoritative primary source. Blog posts need at least two reachable sources from their assigned editorial brief. Humanised content keeps the original frontmatter and is rejected for em dashes or repeated stock AI-writing phrases. Clinic listings require a matching verified clinic record. Doctor profiles require a matching NPI record; roundups require a methodology and matching verified records.

## Verification model

Clinic verification requires a reachable first-party website that mentions an in-scope service. Doctor verification additionally requires an NPI result and a usable physician identity. Search snippets alone are not proof. Public review data may be used only when the platform and figures are present in the verified record.

## Storage

Committed Markdown, verified JSON records, and queue files remain the publishing source of truth. The scheduled workflow requires Supabase as a private operational control plane for run status, verified entities, publication metadata, queue state, Search Console keyword metrics, and repository integrity snapshots. `publication_queue` mirrors every queued, drafted, blocked, and published item together with its source context, exact Markdown where available, content hash, validation result, and repository commit. Supabase detects drift and makes operational state inspectable without replacing the Git-backed deployment state.

## Deployment

Vercel builds each Astro project from its own root and each project owns one apex custom domain. News and Updates publish at their domain roots. Their project-level redirect files permanently move legacy `/news/...` and `/updates/...` URLs to the matching root paths. A local pipeline run creates a scoped Git commit. In GitHub Actions, the workflow validates all five builds before pushing that commit. Local automatic pushes are available only when `AUTO_PUSH=true`; a failed push makes the pipeline fail visibly and retains the local commit.

## Automation and checks

`.github/workflows/ci.yml` runs tests and builds all sites on pushes and pull requests. `.github/workflows/pipeline.yml` runs every pipeline stage at 02:23, 10:23, and 18:23 UTC after repository secrets are configured. Daily velocity caps are shared across the three runs. The non-round minute reduces exposure to GitHub's busiest scheduler window. Manual dispatch defaults to a non-writing dry run. `pipeline/scripts/check-sites.mjs` inspects built output for placeholder or sample content, em dashes, broken internal links, robots mistakes, incorrect canonicals, shared stylesheet drift, the shared favicon set, and exactly 100 focused answers for each of the six header sections.

## Shared presentation

The layouts are intentionally separate because their active section and footer wording differ. The canonical stylesheet is maintained in `sites/doctors/public/styles/global.css` and copied byte-for-byte to the other four projects. The integrity check rejects drift. All layouts use the permanent Wellness palette, self-hosted Plus Jakarta Sans typography, the shared SVG identity and favicon set, and the public domain map from `src/lib/sections.ts`. FAQ content is generated from six section-specific topic specifications in `shared/faq.ts` and rendered by `shared/FaqCenter.astro`; Blog and Laws & legal intentionally use separate FAQ routes on their shared domain.

## Domain deployment map

Attach the domains in Vercel as follows:

1. Clinics project (`site/`): `mypeptide.club`.
2. Doctors project (`sites/doctors/`): `toppeptideslist.com`.
3. Safe Peptides project (`sites/content/`): `safepeptides.us`.
4. News project (`sites/news/`): `peptidesnews.us`.
5. Updates project (`sites/updates/`): `peptidesupdates.com`.
6. Redirect each `www` hostname to its apex hostname in Vercel.

Run `npm run check` before deployment.
