# Environment and automation setup

## Where each value belongs

| Location | Put these values there | Purpose |
| --- | --- | --- |
| Repository root `.env` | Pipeline keys, Supabase values, and optional Search Console credentials | Local pipeline runs only |
| GitHub Actions secrets | OpenAI, Exa, Supabase, optional Gemini, and optional Search Console credentials | Scheduled autonomous pipeline |
| GitHub Actions variables | Model names and Search Console property identifiers | Non-secret pipeline configuration |
| Each Vercel project | `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CORRECTIONS_EMAIL`, optional `PUBLIC_SECURITY_EMAIL`, optional `PUBLIC_PLAUSIBLE_DOMAIN` | Public site builds |
| Safe Peptides and Updates Vercel projects | Optional `PUBLIC_NEWSLETTER_URL` | Hosted Beehiiv or Substack subscribe page; RSS works without it |

Never put OpenAI, Exa, Gemini, or a Supabase server secret key in a `PUBLIC_*` variable. The static sites do not need those private keys.

## Local development

Copy `.env.example` to `.env` in the repository root. This file is ignored by Git. It is loaded by `pipeline/orchestrator.mjs` and the pipeline scripts.

Required:

- `OPENAI_API_KEY`
- `EXA_API_KEY`

Optional:

- `GEMINI_API_KEY` and `GEMINI_MODEL` for generated images
- `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` (recommended) or the legacy `SUPABASE_SERVICE_ROLE_KEY` for the operational database mirror
- `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64` for free first-party query metrics
- Model overrides beginning with `OPENAI_`

Run `npm run preflight` before a live local cycle. Keep `AUTO_PUSH=false` until the generated commit has been reviewed.

When an Astro project is launched directly with `npm --prefix <project> run dev`, it does not load the repository root `.env`. Set the three public variables in the shell or create a project-local `.env` containing only those public values.

## GitHub Actions

Add these under the repository's Actions secrets:

Required secrets:

- `OPENAI_API_KEY`
- `EXA_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` for a current `sb_secret_...` key, or `SUPABASE_SERVICE_ROLE_KEY` for a legacy service-role key

Optional secrets:

- `GEMINI_API_KEY`
- `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64`

Add model overrides as Actions variables when needed:

- `OPENAI_WRITING_MODEL`
- `OPENAI_HUMANISE_MODEL`
- `OPENAI_VERIFY_MODEL`
- `OPENAI_SUMMARY_MODEL`
- `GEMINI_MODEL`
- `GOOGLE_SEARCH_CONSOLE_PROPERTIES`

Recommended compatible starting values are `gpt-4.1` for writing and humanising, and `gpt-4.1-mini` for verification and summaries. These are configuration values, not secrets. The repository uses the same values as safe defaults when the variables are omitted.

The workflow uses the repository-provided `GITHUB_TOKEN`; no separate GitHub token is needed. The workflow needs write permission to repository contents. A manual workflow run defaults to dry-run mode. Scheduled runs execute at 02:23, 10:23, and 18:23 UTC, which is 07:53, 15:53, and 23:53 India time. Each run validates all five sites and pushes only after validation succeeds.

GitHub Actions is the scheduler and worker, so cron-job.org is not required. An external URL cron service could only call an exposed endpoint; it would add another credential and failure point while the repository workflow already has secure access to the code, secrets, commit history, and Vercel-triggering push.

## Editorial selection and human review

`pipeline/queue/blog-topics.json` is the central evergreen content plan. Each entry fixes the title, primary keyword, supporting phrases, reader intent, category, priority, and approved authoritative sources. The daily run selects the highest-priority ready topic that has not already been drafted, edited, or published. The initial map covers at least 30 publication days and should be expanded before it runs low.

The keywords are seed topics based on reader intent and coverage gaps, not fabricated search-volume numbers. The pipeline stores them in Supabase immediately. When Search Console credentials are configured, it imports up to the top 250 queries per property from the previous 28 days, including impressions, clicks, CTR, and average position, once per day. Matching high-impression, low-CTR topics receive a priority boost. Search Console measures the five sites' own visibility; it is not a global keyword-volume estimator. Metrics older than 90 days are removed to protect the Supabase free-plan database limit.

Every generated draft passes through the humanising stage, including blogs. The stage rewrites formulaic prose but preserves the original YAML frontmatter, facts, names, numbers, and sources. A deterministic guard then blocks em dashes, repeated stock AI phrases, unsupported treatment claims, invalid sources, invalid length, or schema failures. Third-party AI detectors are inconsistent, so the project optimizes for specific, sourced, genuinely edited prose rather than attempting to guarantee a detector score.

## Supabase

Supabase is required by the scheduled GitHub workflow. It stores run audits, verified directory records, published-post metadata, queue mirrors, and keyword metrics. Committed Markdown and JSON remain the deployment source of truth.

To enable it:

1. Create a Supabase project.
2. Apply `supabase/migrations/001_initial_schema.sql`.
3. Apply `supabase/migrations/002_harden_automation_schema.sql`.
4. Apply `supabase/migrations/003_keyword_registry.sql`.
5. Apply `supabase/migrations/004_publication_control.sql`.
6. Store the project URL as `SUPABASE_URL`.
7. Store a current `sb_secret_...` server key as `SUPABASE_SECRET_KEY`. If the project only exposes a legacy service-role key, store it as `SUPABASE_SERVICE_ROLE_KEY` instead. Do not set both.
8. Set `REQUIRE_SUPABASE=true` for a strict local live run. GitHub already sets it.
9. Keep `SUPABASE_CONTROL_PLANE_REQUIRED=true`; migration 004 is applied and the publication control tables are now mandatory.
10. Run `node pipeline/scripts/preflight.mjs --check-supabase`.

The publication control mirror stores every queued item with its source context, stage, exact Markdown and SHA-256 hash when content exists, validation errors, and repository commit. Each live run also records an integrity snapshot. Git remains the source of truth; Supabase is the private control and audit layer and cannot silently replace repository content.

Migration 004 was designed to be rollout-safe, but the production rollout is now complete. Scheduled and strict local runs require both publication control tables; a missing or inaccessible table is a hard preflight failure.

Default API safety budgets are 30 OpenAI calls and 60,000 requested output tokens per run, 10 Gemini image calls per run, and 5 Exa searches per run. The five Exa requests map one-to-one to the bounded primary-source news lanes, so the broader coverage does not increase the existing per-run search budget. Each API also has a request timeout. Override the corresponding `*_MAX_*_PER_RUN` or `*_TIMEOUT_MS` variables only after reviewing provider quotas and the pipeline's daily publication caps.

Gemini image generation is optional. Authentication, model, request, and quota errors disable further image attempts for that run so a broken optional key cannot consume the entire batch budget or block publication.

Do not use an anon or `sb_publishable_...` key here. The automation needs a server-side `sb_secret_...` or legacy service-role key. The migrations keep operational tables private because none of the public sites query Supabase directly.

## Free keyword metrics with Search Console

1. Verify all five domain properties in Google Search Console.
2. Create a Google Cloud service account and enable the Search Console API.
3. Add the service account email as a user on every Search Console property.
4. Base64-encode the complete service-account JSON file as one line.
5. Store that line as the GitHub secret `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64`.
6. Set `GOOGLE_SEARCH_CONSOLE_PROPERTIES` to the comma-separated `sc-domain:` values shown in `.env.example`, or accept those defaults.

The Search Console connection is optional. Until it is configured or until Google records impressions, seed priorities keep article selection deterministic.

## Vercel

Add the following to all five Vercel projects for Production, Preview, and Development as appropriate:

- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_CORRECTIONS_EMAIL`
- `PUBLIC_SECURITY_EMAIL`, if a monitored disclosure mailbox is available
- `PUBLIC_PLAUSIBLE_DOMAIN`, only after analytics is configured

No pipeline, model-provider, Search Console, or Supabase service keys are required in Vercel. Remove any such value found there. Every `PUBLIC_*` value is compiled into client-visible output and must be treated as public.
