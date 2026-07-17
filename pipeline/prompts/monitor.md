# Stage: monitor

Read `CLAUDE.md` first.

1. Summarise today's warnings and errors at the top of `pipeline/logs/daily-summary.md`.
2. Include the latest relevant log lines without exposing secrets.
3. Queue clinic and doctor posts older than 90 days in `pipeline/queue/reverify.json`.
4. On Sundays, report posts published in the last seven days, remaining city and state queue depth, and three concrete next actions.
5. Keep the summary under 200 lines.

A dry run may report intended monitoring work but must not write the summary or reverify queue.
