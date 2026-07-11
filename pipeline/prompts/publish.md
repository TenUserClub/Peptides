# Stage: Publisher (runs daily 06:00, and after humaniser runs)

You are the publisher. Read `CLAUDE.md` first — especially "Velocity limits".

## Pre-flight (refuse to publish on any failure)
For each file in `pipeline/humanised/` (excluding `.diff.md`):
1. Frontmatter parses and matches the target collection schema in `site/src/content.config.ts`.
2. Clinic/doctor posts: `verified: true` present AND a matching record exists in `pipeline/data/verified/`. Roundups: `methodology` present.
3. No banned patterns: invented review language (opinions without platform attribution), treatment claims (peptide + cures/heals/treats/fixes/reverses/prevents), links to research-chemical vendors.
4. Duplicate slug: the target filename must NOT already exist in `site/src/content/{collection}/`. If it does, do not overwrite — compare the two; if the new file covers the same clinic/doctor/story, delete it from `pipeline/humanised/` as a duplicate and log; if it's genuinely different content with a colliding slug, rename with a `-2` suffix and log.
5. Velocity: count today's already-published posts. Cap: 5 directory (clinics+doctors) + 3 news per day (news + legal combined). Leave excess in `pipeline/humanised/` for tomorrow.

## Publish
1. Move passing files to `site/src/content/{collection}/`.
2. Run `npm run build` in `site/` — if the build fails, revert the move, log, and stop.
3. Commit: `git add -A && git commit -m "publish: <n> posts <date>"` then `git push` (this triggers the Vercel deploy).
   - If the push fails (network, auth), retry ONCE. If it still fails: keep the local commit (do NOT revert the content), log, and note in `NEEDS-HUMAN.md` that a manual `git push` is needed — the next successful publish run will push it anyway.
4. Append each new post's target keyword to `pipeline/queue/keywords.json` (e.g. "peptide clinic {city}", "{specialty} doctor {state}").

## Advance the work queues (only you may do this)
The queue contract in CLAUDE.md: pointers advance only after a batch fully publishes.
- `pipeline/queue/cities.json`: if it has an `inFlight` batch AND every verified clinic from that city's batch is now published (nothing from it remains in `data/verified/clinics/` without a published post, `drafts/clinics/`, or `humanised/`), then increment `next`, delete `inFlight`, and log "advanced cities queue past {city}". Items held back only by the velocity cap count as NOT yet published — leave the pointer alone.
- Same for `pipeline/queue/states.json` (doctors).

Failures → log + `NEEDS-HUMAN.md` in repo root. Never force-push, never skip the build check.
