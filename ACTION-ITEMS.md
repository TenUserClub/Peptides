# Current owner action items

Status reconciled against the live repository, GitHub Actions, Supabase, and all five deployed domains on 2026-07-22.

## Owner account choices

- [ ] Rotate the Mailgun API key pasted into the earlier Codex task. It is not used by this repository and must remain out of GitHub, Vercel, and public site code.
- [ ] Choose a free hosted newsletter account, Beehiiv or Substack, then set its HTTPS subscribe-page URL as `PUBLIC_NEWSLETTER_URL` in the Safe Peptides and Updates Vercel projects. Both sites have usable RSS feeds without this setting.
- [ ] Set `PUBLIC_CONTACT_EMAIL` and `PUBLIC_CORRECTIONS_EMAIL` in all five Vercel projects after choosing the public addresses.
- [ ] Verify all five domains in Google Search Console, submit their sitemaps, and optionally add `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64` for query metrics.
- [ ] Set `PUBLIC_PLAUSIBLE_DOMAIN` only if a free Plausible-compatible analytics account is configured.

## Governance

- [ ] Arrange healthcare-marketing and referral-flow legal review before monetisation.
- [ ] Name an editorial reviewer and add `reviewedBy` only after that person has actually reviewed a post.
- [ ] Review correction requests within the stated five-business-day window once the corrections mailbox is active.
- [ ] Audit published medical and regulatory content at least every 90 days and withdraw stale or unsupported claims.

## Engineering watchlist

- [ ] Replace `GEMINI_API_KEY` only with a tested Google AI Studio API key if generated images are wanted. Image generation is optional and the pipeline publishes safely without it.
- [ ] Consider automated Playwright smoke tests later if the additional GitHub Actions minutes and browser downloads are acceptable. Desktop and mobile production checks are currently performed during release review.
- [ ] Review Supabase storage, integrity snapshots, pipeline error trends, and provider usage monthly.

## Verified complete

- [x] Three scheduled editorial runs per day with concurrency control.
- [x] GitHub secrets, scoped write permission, API budgets, timeouts, and security scanning.
- [x] Supabase migrations 001 through 004 and required publication control plane.
- [x] Nationwide starter queues covering every US state for clinics and doctors.
- [x] All five custom domains, apex/www redirects, shared branding, favicons, legal pages, and cross-site navigation.
- [x] Exactly 100 context-specific FAQ answers for each header section.
- [x] Live news and legal publishing from bounded primary-source lanes.
- [x] Provider-neutral RSS feeds for the blog and weekly updates.
- [x] Desktop and 390px mobile checks across all five live domains with no overflow or console issues.
