# Peptide SEO Engine

Autonomous blog pipeline: four content engines (clinics, doctors, news, weekly updates) feeding an Astro site, run 24/7 by scheduled Claude Code agents on this machine. Full strategy: `peptide-seo-plan.md`. Editorial rules every agent obeys: `CLAUDE.md`. Your setup checklist: `ACTION-ITEMS.md`.

## Multi-domain plan

This repo stays ONE monorepo. `site/` is the permanent home of the central **clinic registry**. The other sections (doctors & experts, news, laws & legal, weekly updates) will each move to their own domain later; until then they render locally here. The section→domain mapping lives in ONE file: `site/src/lib/sections.ts` — set a section's `domain` and the nav links out to it. When a section actually splits, its Astro site goes in `sites/{name}/` in this same repo, connected as its own Vercel project (same repo, different Root Directory, own custom domain, "Ignored Build Step: only build on Root Directory changes"), and the publisher starts moving that engine's posts there instead.

## Layout

```
CLAUDE.md            editorial constitution (all agents inherit)
site/                Astro site — content lives in site/src/content/{clinics,doctors,news,legal,updates}
pipeline/
  scripts/           exa-fetch.mjs (news|clinics|doctors) · npi-verify.mjs · rank-track.mjs
  prompts/           agent instructions per stage (verify, write-*, humanise, publish, monitor)
  queue/             cities.json, states.json (work queues) · keywords.json (rank tracking)
  data/              exa/ (raw) → verified/ (fact-checked) · rankings.csv
  drafts/ → humanised/ → site/src/content/   (the content conveyor belt)
setup-scheduler.ps1  registers all Windows scheduled tasks
.env.example         copy to .env, add keys
```

## Daily flow (all automatic)

```
01:00/09:00/17:00  exa news fetch          (script)
02:00 / 02:30      exa clinics / doctors   (script, one city/state per day)
03:00              verify                  (agent: clinic sites + NPI registry; unverified = rejected)
04:00 / 04:30      write clinics / doctors (agent, max 5 + 3 per run)
01:30/09:30/17:30  write news              (agent, max 3/day)
Sun 05:00          write weekly digest     (agent)
05:30/10:00/18:00  humanise                (agent: re-fetches Wikipedia AI-signs page, strips AI style, saves diff)
06:00/10:30/18:30  publish                 (agent: schema check, velocity cap, astro build, git push → auto-deploy)
06:30              monitor                 (agent: rank tracking, error summary, 90-day re-verify queue)
```

Your only routine job: skim `pipeline/logs/daily-summary.md` and the diffs in `pipeline/humanised/`, and act on `NEEDS-HUMAN.md` if it appears.

## First-time setup

Do `ACTION-ITEMS.md` top to bottom. In short: fill `.env`, `npm install` in `site/`, push to GitHub + connect Vercel, run each stage once manually (commands below), then `setup-scheduler.ps1`.

## Run any stage manually

```powershell
node pipeline\scripts\exa-fetch.mjs news        # or clinics | doctors
claude -p "Read and execute pipeline/prompts/verify.md"
claude -p "Read and execute pipeline/prompts/write-clinics.md"
claude -p "Read and execute pipeline/prompts/humanise.md"
claude -p "Read and execute pipeline/prompts/publish.md"
cd site; npm run dev                            # preview at localhost:4321
```

## Design guarantees

- Nothing publishes without passing verification (real clinic site + NPI registry for doctors) and the humaniser.
- Reviews are only ever summaries of real, platform-attributed public reviews (FTC fake-review rule).
- Velocity-capped publishing (5 directory + 3 news/day) to stay clear of Google's scaled-content-abuse classification.
- Every stage logs to `pipeline/logs/`; failures write `NEEDS-HUMAN.md` instead of publishing bad content.
- Laptop asleep at a scheduled time? `-StartWhenAvailable` runs the stage on wake; the conveyor belt resumes where it left off.
