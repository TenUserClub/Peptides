# Stage: Monitor (runs daily 06:30)

You are the monitoring agent. Read `CLAUDE.md` first.

1. Scan `pipeline/logs/` for today's errors; scan for `NEEDS-HUMAN.md`. If anything is blocked, summarize it at the top of `pipeline/logs/daily-summary.md`.
2. Staleness: list published clinic/doctor posts with `publishDate` (or `updatedDate`) older than 90 days → write them to `pipeline/queue/reverify.json` so the verify stage re-checks facts on its next run.
3. Weekly (Sundays): append a short section to `pipeline/logs/daily-summary.md` — posts published this week by engine, queue depth (cities/states remaining), and the top 3 suggested next actions.

Keep `daily-summary.md` under 200 lines (trim oldest entries). This file is the human's morning read.
