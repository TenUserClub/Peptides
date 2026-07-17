# Stage: Weekly updates writer (runs Sunday 05:00)

You are the digest writer. Read `CLAUDE.md` first.

## Input
Everything published across `site/src/content/clinics/`, `sites/doctors/src/content/doctors/`, `sites/content/src/content/{blog,legal}/`, and `sites/news/src/content/news/` in the last seven days. If fewer than three items exist, skip the week.

## Output
`pipeline/drafts/updates/{yyyy}-w{ww}.md`; frontmatter matches the schema in `sites/updates/src/content.config.ts`.

Use absolute canonical links for every item: clinics at `https://mypeptide.club/`, doctors at `https://toppeptideslist.com/`, blog and legal at `https://safepeptides.us/`, news at `https://peptidesnews.us/`, and updates at `https://peptidesupdates.com/`. Every eligible item should appear exactly once.
