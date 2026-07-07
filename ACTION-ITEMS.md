# Your Action Items — do these in order

Everything is built. These are the only things I couldn't do for you.

## 1. Accounts & keys (~30 min)

- [ ] **Buy the domain** (Namecheap or Cloudflare Registrar, ~$10/yr). Then replace `YOUR-DOMAIN.com` in these 3 files: `site/astro.config.mjs`, `site/src/layouts/Base.astro` (corrections email), `site/src/pages/contact.astro`.
- [ ] **Exa API key** — exa.ai → dashboard → API keys.
- [ ] **DataForSEO** — dataforseo.com → register → $50 top-up → note API login + password. (Optional at start; rank tracking skips itself if missing.)
- [ ] Copy `.env.example` → `.env` in this folder and fill in `EXA_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `SITE_DOMAIN`.
- [ ] Email: create `hello@` and `corrections@` on your domain (Cloudflare Email Routing is free — forward to your inbox).

## 2. Site & deploy (~30 min)

- [x] `cd site && npm install && npm run build` — done and verified on this machine 2026-07-07 (10 pages, clean).
- [ ] Delete the 4 sample posts: `site/src/content/*/_sample-*.md` (they're format references for the agents; agents were told to read them from git history is fine — actually keep them until the first real posts exist if you want the site non-empty locally, but delete before connecting the live domain).
- [ ] ~~`git init && git add -A && git commit -m "initial"`~~ local init + initial commit done 2026-07-07 — you still need to: push to a new private GitHub repo.
- [ ] **Cloudflare Pages** (or Vercel): connect the repo, build command `npm run build`, root directory `site`, output `dist`. Attach your domain.
- [ ] Confirm `git push` works from this machine without a password prompt (SSH key or credential manager) — the publisher agent depends on it.

## 3. Google (~15 min)

- [ ] **Google Search Console**: add your domain, verify via the DNS record, submit `https://your-domain.com/sitemap-index.xml`.

## 4. First supervised run (~1 hour, do this before scheduling)

Run each stage once, in order, and eyeball the output:

```powershell
node pipeline\scripts\exa-fetch.mjs news
claude -p "Read and execute pipeline/prompts/write-news.md"
claude -p "Read and execute pipeline/prompts/humanise.md"     # check the .diff.md it saves
claude -p "Read and execute pipeline/prompts/publish.md"
```

Then the clinic chain: `exa-fetch.mjs clinics` → `verify.md` → `write-clinics.md` → `humanise.md` → `publish.md`.
Also smoke-test: `node pipeline\scripts\npi-verify.mjs John Smith FL` (should print JSON matches; it's a free public API).

## 5. Go autonomous (~5 min)

- [ ] Elevated PowerShell: `powershell -ExecutionPolicy Bypass -File .\setup-scheduler.ps1`
- [ ] Windows Settings → Power: set "when plugged in, put to sleep" to **Never** (scheduled tasks can't wake a lid-closed laptop reliably; `-StartWhenAvailable` catches missed runs on wake either way).
- [ ] Confirm `node` and `claude` run from a plain `cmd.exe` (PATH).

## 6. Your recurring routine (~10 min/day)

- Skim `pipeline/logs/daily-summary.md` each morning.
- Spot-check a couple of `pipeline/humanised/*.diff.md` files.
- If `NEEDS-HUMAN.md` appears in the repo root, something refused to publish — read it.

## Parked for later (from the plan)

- Legal hour with a healthcare-marketing attorney before monetizing leads.
- Compound pillar pages, regulatory tracker, lead monetization, productization (plan §7 "Deferred").
- Move scheduling off the laptop (GitHub Actions/VPS) when reliability starts to matter commercially.
