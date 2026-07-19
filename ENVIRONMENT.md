# Environment and automation setup

## Where each value belongs

| Location | Put these values there | Purpose |
| --- | --- | --- |
| Repository root `.env` | `OPENAI_API_KEY`, `EXA_API_KEY`, optional Gemini and Supabase values | Local pipeline runs only |
| GitHub Actions secrets | Private API keys and optional Supabase values | Scheduled autonomous pipeline |
| GitHub Actions variables | Model names | Non-secret pipeline configuration |
| Each Vercel project | `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CORRECTIONS_EMAIL`, optional `PUBLIC_PLAUSIBLE_DOMAIN` | Public site builds |

Never put OpenAI, Exa, Gemini, or the Supabase service role key in a `PUBLIC_*` variable. The static sites do not need those private keys.

## Local development

Copy `.env.example` to `.env` in the repository root. This file is ignored by Git. It is loaded by `pipeline/orchestrator.mjs` and the pipeline scripts.

Required:

- `OPENAI_API_KEY`
- `EXA_API_KEY`

Optional:

- `GEMINI_API_KEY` and `GEMINI_MODEL` for generated images
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for run auditing
- Model overrides beginning with `OPENAI_`

Run `npm run preflight` before a live local cycle. Keep `AUTO_PUSH=false` until the generated commit has been reviewed.

When an Astro project is launched directly with `npm --prefix <project> run dev`, it does not load the repository root `.env`. Set the three public variables in the shell or create a project-local `.env` containing only those public values.

## GitHub Actions

Add these under the repository's Actions secrets:

Required secrets:

- `OPENAI_API_KEY`
- `EXA_API_KEY`

Optional secrets:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Add model overrides as Actions variables when needed:

- `OPENAI_WRITING_MODEL`
- `OPENAI_HUMANISE_MODEL`
- `OPENAI_VERIFY_MODEL`
- `OPENAI_SUMMARY_MODEL`
- `GEMINI_MODEL`

The workflow uses the repository-provided `GITHUB_TOKEN`; no separate GitHub token is needed. The workflow needs write permission to repository contents. A manual workflow run defaults to dry-run mode. Scheduled runs execute the full pipeline every six hours, create a scoped publication commit, validate all five sites, and push only after validation succeeds.

## Supabase

Supabase is optional. Without it, the pipeline continues to use committed Markdown, verified JSON records, and queue files as its source of truth.

To enable the private run audit:

1. Create a Supabase project.
2. Apply `supabase/migrations/001_initial_schema.sql`.
3. Apply `supabase/migrations/002_harden_automation_schema.sql`.
4. Store the project URL as `SUPABASE_URL`.
5. Store the server-side service role key as `SUPABASE_SERVICE_ROLE_KEY`.
6. Run `node test-db.mjs` locally or dispatch the GitHub workflow in dry-run mode.

Do not use the anon key in place of the service role key. The migrations keep operational tables private because none of the public sites query Supabase directly.

## Vercel

Add the following to all five Vercel projects for Production, Preview, and Development as appropriate:

- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_CORRECTIONS_EMAIL`
- `PUBLIC_PLAUSIBLE_DOMAIN`, only after analytics is configured

No pipeline or Supabase service keys are required in Vercel.
