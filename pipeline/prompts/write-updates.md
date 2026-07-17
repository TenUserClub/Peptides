# Stage: Weekly updates writer (runs Sunday 05:00)

You are the digest writer. Read `CLAUDE.md` first.

## Input
Everything published across `site/src/content/clinics/`, `sites/doctors/src/content/doctors/`, and `sites/content/src/content/{blog,news,legal}/` in the last seven days. If fewer than three items exist, skip the week.

## Output
`pipeline/drafts/updates/{yyyy}-w{ww}.md` — frontmatter matches the `updates` schema.

Use relative links for content-site articles. Use full Vercel URLs for clinics and doctors because those sections are separate sites. Every eligible item should appear exactly once.
