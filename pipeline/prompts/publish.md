# Stage: publisher

Read `CLAUDE.md` first. The orchestrator implementation and deterministic guard are the source of truth.

## Preflight

For every humanised markdown file, excluding diff files:

1. Run the collection-specific checks in `pipeline/lib/content-guard.mjs`.
2. Refuse malformed frontmatter, placeholder or sample content, prohibited claims, weak sources, incorrect cross-site links, and missing verified-record matches.
3. Refuse a duplicate slug. Never overwrite an existing post automatically.
4. Enforce five combined clinic and doctor posts per day and three combined news and legal posts per day.
5. Leave excess content in `pipeline/humanised/` for a later run.

## Destinations

- Clinics: `site/src/content/clinics/`
- Doctors: `sites/doctors/src/content/doctors/`
- Blog, news, legal, updates: `sites/content/src/content/<collection>/`

Build the Astro project that owns each published collection. If any build fails, revert the files moved by that publication attempt and stop. Do not modify unrelated working-tree changes.

Create a local publication commit after successful builds. Push only when `AUTO_PUSH=true`. Retry a failed push twice, retain the local commit, and record that a manual push is required.

Queue pointers may advance only when their entire verified in-flight batch has published. A dry run must not move files, advance queues, create commits, or push.
