-- Private publication control and integrity audit tables.
-- Git remains the source of truth; these tables mirror queue context and exact
-- content hashes so automation can detect drift before or after publication.

create table if not exists publication_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  collection text not null
    check (collection in ('clinics', 'doctors', 'blog', 'news', 'legal', 'updates')),
  item_key text not null,
  title text,
  status text not null default 'queued'
    check (status in ('queued', 'drafted', 'humanised', 'validated', 'published', 'blocked', 'withdrawn')),
  source_file text,
  source_context jsonb not null default '{}',
  content_markdown text,
  content_sha256 text,
  validation_errors jsonb not null default '[]',
  repo_commit text,
  publish_date date,
  published_at timestamptz,
  metadata jsonb not null default '{}',
  unique (collection, item_key)
);

create index if not exists idx_publication_queue_status
  on publication_queue(status);
create index if not exists idx_publication_queue_collection
  on publication_queue(collection);
create index if not exists idx_publication_queue_updated_at
  on publication_queue(updated_at desc);

create table if not exists integrity_checks (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  scope text not null default 'repository',
  status text not null check (status in ('pass', 'warn', 'fail')),
  repo_commit text,
  items_checked integer not null default 0,
  issues_found integer not null default 0,
  details jsonb not null default '{}'
);

create index if not exists idx_integrity_checks_checked_at
  on integrity_checks(checked_at desc);
create index if not exists idx_integrity_checks_status
  on integrity_checks(status);

alter table publication_queue enable row level security;
alter table integrity_checks enable row level security;
revoke all on table publication_queue from anon, authenticated;
revoke all on table integrity_checks from anon, authenticated;

comment on table publication_queue is
  'Private mirror of queued, drafted, validated, and published repository content with source context and exact hashes.';
comment on table integrity_checks is
  'Private audit snapshots comparing repository queues, content, validation results, and the Supabase control mirror.';

-- Repair counters written by orchestrator versions that stored the detailed
-- outcome only in log_summary.
update pipeline_runs
set items_processed =
  coalesce(((regexp_match(log_summary, 'verified=([0-9]+)'))[1])::integer, 0) +
  coalesce(((regexp_match(log_summary, 'drafted=([0-9]+)'))[1])::integer, 0) +
  coalesce(((regexp_match(log_summary, 'humanised=([0-9]+)'))[1])::integer, 0) +
  coalesce(((regexp_match(log_summary, 'published=([0-9]+)'))[1])::integer, 0) +
  coalesce(((regexp_match(log_summary, 'mirrored=([0-9]+)'))[1])::integer, 0)
where items_processed = 0 and log_summary ~ 'verified=[0-9]+';

update pipeline_runs
set items_failed = 1
where status = 'failed' and items_failed = 0;
