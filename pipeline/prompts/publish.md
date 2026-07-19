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
- Blog and legal: `sites/content/src/content/<collection>/`
- News: `sites/news/src/content/news/`
- Updates: `sites/updates/src/content/updates/`

Build the Astro project that owns each published collection. If any build fails, revert the files moved by that publication attempt and stop. Do not modify unrelated working-tree changes.

Create a scoped local publication commit after successful builds. Refuse to mix it with pre-existing staged changes. A local run may push only when `AUTO_PUSH=true`; a failed push must retain the commit and fail visibly. In GitHub Actions, keep `AUTO_PUSH=false`, validate all five sites after the pipeline finishes, and let the workflow push the validated commit.

Queue pointers may advance only when their entire verified in-flight batch has published. A dry run must not move files, advance queues, create commits, or push.
