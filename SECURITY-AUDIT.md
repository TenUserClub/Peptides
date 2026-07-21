# Security audit

Audit date: 2026-07-22

## Scope and result

The review covered the Git repository and history, local generated output, GitHub Actions, repository security settings, the Node publishing pipeline, Supabase credential use, Vercel configuration, dependencies, and public privacy and disclosure information.

No configured API key or server credential was found in tracked Git history or generated public site output. The root `.env` is untracked. The matching historical scan finding was a normal prose substring, not a credential.

## Controls implemented

- Server-only environment files, private keys, service-account files, and credential files are ignored by default.
- CI checks tracked filenames and public build output for configured secrets and server-only variable names.
- GitHub Actions dependencies are pinned to immutable full commit IDs. CI has read-only repository permission and no persisted checkout credential.
- Pipeline secrets are available only to the preflight and guarded pipeline steps, not dependency installation, builds, audits, or publishing validation.
- CodeQL and grouped Dependabot updates are configured. Every package tree is audited for high-severity vulnerabilities in CI.
- GitHub provider-pattern secret scanning, push protection, and Dependabot security updates are enabled. The first history-wide GitHub scan reported zero open alerts. Generic non-provider patterns and validity checks were not available under the repository's current GitHub feature set, so the repository also runs its own exact-value and public-output checks.
- Outbound source fetching rejects local, private, reserved, and metadata IP ranges; validates DNS destinations; pins each request to a vetted address; revalidates redirects; limits response size and type; and enforces timeouts.
- Supabase migration 004 is applied. Strict preflight now requires and verifies both publication control tables before a live run.
- Supabase server keys can only be sent to a credential-free HTTPS project hostname on `supabase.co`. Search Console OAuth assertions can only be sent to Google’s fixed token endpoint. Gemini API keys are sent in a request header instead of the URL.
- Logs redact configured credentials, bearer tokens, query-string API keys, and recognizable server-secret formats. Provider error bodies are length-limited.
- All five Vercel properties define CSP, clickjacking, MIME-sniffing, referrer, browser-feature, cross-origin opener, and legacy XSS-filter headers. Vercel supplies HSTS by default.
- Each domain publishes an RFC 9116 `security.txt`. The site now includes privacy, terms, security disclosure, accessibility, and context-specific legal disclaimers.

## Owner-controlled follow-up

- Add `PUBLIC_SECURITY_EMAIL` to all Vercel projects if a monitored security mailbox is available.
- Review Vercel environment variables and remove any private pipeline key. Only `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CORRECTIONS_EMAIL`, `PUBLIC_SECURITY_EMAIL`, and optional `PUBLIC_PLAUSIBLE_DOMAIN` belong there.
- Keep provider keys least-privileged, review provider audit logs and last-used dates, and rotate on staff or service changes or any suspected exposure. No emergency rotation is required by this audit because no exposure was found.
- The default branch remains directly writable because the scheduled editorial workflow publishes verified content to it. Before enforcing branch protection, configure a repository ruleset that requires the quality and CodeQL checks while explicitly permitting the trusted publishing workflow to bypass only that rule.
