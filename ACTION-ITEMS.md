# Owner action items

## Before resuming publication

- [ ] Run `npm run check` and resolve every failure.
- [ ] Add `EXA_API_KEY` and `OPENAI_API_KEY` as GitHub Actions secrets.
- [ ] Add `PUBLIC_CONTACT_EMAIL` and `PUBLIC_CORRECTIONS_EMAIL` to all three Vercel projects.
- [ ] Run `node pipeline/orchestrator.mjs all --dry-run` and confirm queues and processed markers do not change.
- [ ] Run the first live cycle with `AUTO_PUSH=false` and review every generated markdown file.
- [ ] Push only after the reviewed local build passes.

## Vercel and discovery

- [ ] Confirm all three projects use their matching root directories.
- [ ] Submit each sitemap to Google Search Console.
- [ ] Set `PUBLIC_PLAUSIBLE_DOMAIN` only after a Plausible site is configured.
- [ ] Keep the current Vercel URLs until the UI and initial compliant content are approved.

## When custom domains are ready

- [ ] Attach and verify each domain in Vercel.
- [ ] Update the three Astro canonical site settings.
- [ ] Update all three shared section maps and robots sitemap URLs.
- [ ] Update the weekly review domain map.
- [ ] Run the full check and verify cross-site navigation on the deployed domains.

## Governance

- [ ] Arrange healthcare-marketing and referral-flow legal review before monetisation.
- [ ] Define a named editorial reviewer and add `reviewedBy` to reviewed posts.
- [ ] Review correction requests within the stated five-business-day window.
- [ ] Audit posts at least every 90 days and withdraw stale or unsupported claims.

## Later improvements

- [ ] Add end-to-end browser checks for navigation, keyboard theme selection, and mobile layouts.
- [ ] Decide whether to integrate Supabase into orchestrator state or remove the optional helper.
- [ ] Add custom-domain redirects only after the final domain mapping is known.
