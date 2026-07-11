# Your Action Items — do these in order

## 1. Accounts & keys (~15 min) — ✅ MOSTLY DONE

- [x] **Exa API key** — exa.ai → dashboard → API keys.
- [x] **OpenAI API key** — platform.openai.com → API keys.
- [x] **Gemini API key** — aistudio.google.com → API keys (for image generation).
- [x] **Supabase project** — supabase.com → new project → note URL + service_role key.
- [x] Copy `.env.example` → `.env` in repo root and fill all keys.
- [ ] **Update corrections email** — in `site/src/layouts/Base.astro`, replace `corrections@example.com` with a real email once you have one.

## 2. Site & deploy (~30 min)

- [x] `cd site && npm install && npm run build` — verified working.
- [ ] **Push to GitHub** — create a private repo, push this project.
- [ ] **Connect Vercel** — vercel.com → Add New → Project → import the GitHub repo → set **Root Directory** to `site` (framework auto-detects as Astro; build `npm run build`, output `dist` are picked up automatically) → Deploy.
- [ ] **Update domain references** — after Vercel gives you a `*.vercel.app` domain, update:
  - `.env`: `SITE_DOMAIN=your-name.vercel.app`
  - `site/astro.config.mjs`: `site: 'https://your-name.vercel.app'`
  - `site/public/robots.txt`: sitemap URL
- [ ] **Delete sample posts** — when you have real content in all collections, delete `site/src/content/*/_sample-*.md`.
- [ ] Confirm `git push` works from this machine without a password prompt (SSH key or credential manager) — the publisher depends on it.

## 3. Google (~15 min)

- [ ] **Google Search Console**: add your Vercel domain, verify via the URL prefix method, submit `https://your-domain.com/sitemap-index.xml`.

## 4. First supervised run (~30 min) — ✅ NEWS PIPELINE WORKS

The news pipeline has been tested end-to-end. Run each stage once to validate on your machine:

```powershell
node pipeline\scripts\exa-fetch.mjs news
node pipeline\orchestrator.mjs write-news
node pipeline\orchestrator.mjs write-blog
node pipeline\orchestrator.mjs humanise
node pipeline\orchestrator.mjs publish
```

Also smoke-test: `node pipeline\scripts\npi-verify.mjs "John" "Smith" FL` (should print JSON matches; it's a free public API).

## 5. Go autonomous (~10 min)

- [ ] **Set up scheduler** — pick one:
  - **Kimi cron** (recommended): Set up a recurring job every 6 hours running `node pipeline\orchestrator.mjs all`
  - **Windows Task Scheduler**: Create a task running `node C:\path\to\pipeline\orchestrator.mjs all` every 6 hours
  - **GitHub Actions**: Run the orchestrator on a schedule from GitHub (requires self-hosted runner or storing keys as secrets)
- [ ] Windows Settings → Power: set "when plugged in, put to sleep" to **Never** (if using local scheduler).
- [ ] Confirm `node` runs from a plain `cmd.exe` (PATH).

## 6. Your recurring routine (~5 min/day)

- Skim `pipeline/logs/daily-summary.md` each morning.
- Spot-check a couple of `pipeline/humanised/*.diff.md` files.
- If errors spike in logs, investigate before the next run.

## Parked for later

- **Rank tracking API** — deferred; use Google Search Console for now.
- **Design overhaul** — execute `DESIGN-PROMPT.md` when ready (three themes).
- **Analytics** — add Plausible or GA4 after first deploy.
- **Lead monetization** — add "Request consultation" CTAs after 100 organic visits/day.
- **Legal review** — consult a healthcare-marketing attorney before monetizing leads.
- **Vercel Pro** — upgrade from Hobby ($20/mo) when the site starts monetizing (Hobby is for non-commercial use).
- **Compound pillar pages, regulatory tracker** — revisit once traffic exists.
