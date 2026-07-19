# Owner action items

## Before resuming publication

- [ ] Run `npm run check` and resolve every failure.
- [ ] Add `EXA_API_KEY` and `OPENAI_API_KEY` as GitHub Actions secrets.
- [ ] Add `OPENAI_WRITING_MODEL=gpt-4.1`, `OPENAI_HUMANISE_MODEL=gpt-4.1`, `OPENAI_VERIFY_MODEL=gpt-4.1-mini`, and `OPENAI_SUMMARY_MODEL=gpt-4.1-mini` as GitHub Actions variables, or accept the identical repository defaults.
- [ ] Add `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` (recommended) or legacy `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets. Gemini remains optional.
- [ ] Apply Supabase migrations `001`, `002`, and `003` in order.
- [ ] Verify all five domains in Search Console, then optionally add `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64` for free query metrics.
- [ ] Confirm GitHub Actions has permission to write repository contents.
- [ ] Add `PUBLIC_CONTACT_EMAIL` and `PUBLIC_CORRECTIONS_EMAIL` to all five Vercel projects.
- [ ] Run `node pipeline/orchestrator.mjs all --dry-run` and confirm queues and processed markers do not change.
- [ ] Dispatch the Editorial pipeline workflow once with `dry_run` enabled.
- [ ] Review the priority order in `pipeline/queue/blog-topics.json`; it contains the first 30-plus seed topics and does not claim search-volume data.
- [ ] Run the first live cycle with `AUTO_PUSH=false` and review every generated markdown file.
- [ ] Push only after the reviewed local build passes.

## Vercel and discovery

- [ ] Confirm all five projects use their matching root directories.
- [ ] Submit each sitemap to Google Search Console.
- [ ] Set `PUBLIC_PLAUSIBLE_DOMAIN` only after a Plausible site is configured.
- [ ] Confirm each custom domain serves the expected section after the first deployment.

## Custom-domain activation

- [ ] Attach `mypeptide.club` to the clinics project.
- [ ] Attach `toppeptideslist.com` to the doctors project.
- [ ] Attach `safepeptides.us` to the Safe Peptides project rooted at `sites/content/`.
- [ ] Create a News project rooted at `sites/news/` and attach `peptidesnews.us`.
- [ ] Create an Updates project rooted at `sites/updates/` and attach `peptidesupdates.com`.
- [ ] Redirect every `www` hostname to its apex hostname in Vercel.
- [ ] Run the full check and verify cross-site navigation on the deployed domains.

## Governance

- [ ] Arrange healthcare-marketing and referral-flow legal review before monetisation.
- [ ] Define a named editorial reviewer and add `reviewedBy` to reviewed posts.
- [ ] Review correction requests within the stated five-business-day window.
- [ ] Audit posts at least every 90 days and withdraw stale or unsupported claims.

## Later improvements

- [ ] Add end-to-end browser checks for navigation and mobile layouts.
- [ ] Review Supabase storage and pipeline error trends monthly.
- [ ] Confirm the remaining custom-domain redirects after every domain is attached in Vercel.
