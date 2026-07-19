-- Search Console keyword opportunity registry.
-- Apply after 001_initial_schema.sql and 002_harden_automation_schema.sql.

create table if not exists keyword_registry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  source text not null default 'google_search_console'
    check (source in ('google_search_console', 'editorial_seed')),
  property text not null,
  keyword text not null,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric,
  period_start date not null,
  period_end date not null,
  metadata jsonb not null default '{}',
  unique (property, keyword, period_end)
);

create index if not exists idx_keyword_registry_keyword on keyword_registry(keyword);
create index if not exists idx_keyword_registry_checked_at on keyword_registry(checked_at);
create index if not exists idx_keyword_registry_period_end on keyword_registry(period_end);
create index if not exists idx_keyword_registry_impressions on keyword_registry(impressions desc);
create index if not exists idx_keyword_registry_property on keyword_registry(property);

alter table keyword_registry enable row level security;
revoke all on table keyword_registry from anon, authenticated;

comment on table keyword_registry is
  'Private Google Search Console query metrics used to prioritize the editorial topic queue.';

comment on table rankings is
  'Legacy third-party SERP snapshots. keyword_registry is the free Search Console-backed source used by the current pipeline.';
