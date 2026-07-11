-- Peptide SEO Engine — Supabase Schema
-- Free tier: 500MB database, 2GB bandwidth, 1GB storage

-- ── Verified clinic records ─────────────────────────────────────
create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Identifiers
  slug text not null unique,
  clinic_name text not null,
  city text not null,
  state text not null, -- two-letter code

  -- Contact
  address text,
  website text,
  phone text,

  -- Practitioner
  doctor_name text,
  npi text,

  -- Services (stored as JSON array)
  services jsonb default '[]',

  -- Ratings (from named public platforms only)
  rating_value numeric(2,1) check (rating_value >= 0 and rating_value <= 5),
  rating_count integer check (rating_count >= 0),
  rating_source text,

  -- Verification
  verified boolean not null default false,
  verified_at timestamptz,
  verification_sources jsonb default '[]', -- URLs that confirmed this record

  -- Status
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'stale')),
  rejected_reason text,

  -- Metadata
  exa_batch_id text, -- links back to the Exa fetch that found this
  notes text
);

comment on table clinics is 'Verified peptide therapy clinics. Only verified=true records get published.';
comment on column clinics.verified is 'Must be true before publishing. Set by the verify stage.';
comment on column clinics.status is 'pending = awaiting verification, verified = passed NPI+site check, rejected = failed, stale = needs re-verification (>90 days)';

-- ── Verified doctor records ─────────────────────────────────────
create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  slug text not null unique,
  kind text not null default 'profile' check (kind in ('profile', 'roundup')),

  -- Identity
  doctor_name text,
  npi text unique,
  credentials text, -- MD, DO, etc.

  -- Location
  city text,
  state text not null, -- two-letter code

  -- Specialty
  specialty text not null,
  taxonomies jsonb default '[]', -- from NPI registry

  -- Ratings
  rating_value numeric(2,1) check (rating_value >= 0 and rating_value <= 5),
  rating_count integer check (rating_count >= 0),
  rating_source text,

  -- Roundup-specific
  methodology text,
  ranked_doctors jsonb default '[]', -- for roundups: list of doctor IDs

  -- Verification
  verified boolean not null default false,
  verified_at timestamptz,
  verification_sources jsonb default '[]',

  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'stale')),
  rejected_reason text,

  exa_batch_id text,
  notes text
);

comment on table doctors is 'Verified physicians and practitioner roundups.';

-- ── Published posts metadata ────────────────────────────────────
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  -- Content
  title text not null,
  slug text not null,
  description text not null,
  collection text not null check (collection in ('news', 'clinics', 'doctors', 'legal', 'updates')),

  -- URLs
  source_name text,
  source_url text,
  site_url text, -- full URL on the live site

  -- Publishing
  publish_date date not null,
  published boolean not null default false,
  published_at timestamptz,

  -- Images
  featured_image text,
  og_image text,

  -- SEO
  tags jsonb default '[]',
  keywords jsonb default '[]',

  -- Performance (updated by monitor stage)
  pageviews integer default 0,
  avg_position numeric(5,2),

  -- Relations
  clinic_id uuid references clinics(id) on delete set null,
  doctor_id uuid references doctors(id) on delete set null,

  -- Unique constraint: one post per slug per collection
  unique (slug, collection)
);

comment on table posts is 'Metadata for every published post. Markdown content lives in the repo.';

-- ── Rank tracking ───────────────────────────────────────────────
create table if not exists rankings (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz default now(),

  keyword text not null,
  position integer, -- null = not in top 100
  url text,
  domain text,

  -- SERP metadata
  serp_features jsonb default '[]', -- featured snippets, people also ask, etc.

  unique (keyword, checked_at)
);

comment on table rankings is 'Daily SERP position tracking from DataForSEO.';

-- ── Work queue state ────────────────────────────────────────────
create table if not exists queue_state (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz default now(),

  queue_name text not null unique, -- 'cities' | 'states' | 'keywords'
  next_index integer not null default 0,

  -- In-flight batch tracking
  in_flight_label text,
  in_flight_file text,
  in_flight_at timestamptz,

  -- Stats
  total_processed integer default 0,
  total_published integer default 0,
  total_skipped integer default 0
);

comment on table queue_state is 'Persistent queue pointers. Replaces pipeline/queue/*.json files.';

-- ── Pipeline run log ────────────────────────────────────────────
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,

  stage text not null, -- 'fetch-news' | 'write-news' | 'humanise' | 'publish' | 'monitor' | 'all'
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),

  -- Counts
  items_processed integer default 0,
  items_failed integer default 0,

  -- Details
  log_summary text,
  error_message text,

  -- Metadata
  dry_run boolean default false,
  model_used text -- which OpenAI model
);

comment on table pipeline_runs is 'Audit log of every orchestrator run.';

-- ── Indexes for common queries ──────────────────────────────────
create index if not exists idx_clinics_state on clinics(state);
create index if not exists idx_clinics_city on clinics(city);
create index if not exists idx_clinics_status on clinics(status);
create index if not exists idx_clinics_verified on clinics(verified);

create index if not exists idx_doctors_state on doctors(state);
create index if not exists idx_doctors_specialty on doctors(specialty);
create index if not exists idx_doctors_status on doctors(status);
create index if not exists idx_doctors_verified on doctors(verified);

create index if not exists idx_posts_collection on posts(collection);
create index if not exists idx_posts_publish_date on posts(publish_date);
create index if not exists idx_posts_published on posts(published);

create index if not exists idx_rankings_keyword on rankings(keyword);
create index if not exists idx_rankings_checked_at on rankings(checked_at);

create index if not exists idx_pipeline_runs_stage on pipeline_runs(stage);
create index if not exists idx_pipeline_runs_started_at on pipeline_runs(started_at);

-- ── Row Level Security (RLS) ────────────────────────────────────
-- Enable RLS on all tables
alter table clinics enable row level security;
alter table doctors enable row level security;
alter table posts enable row level security;
alter table rankings enable row level security;
alter table queue_state enable row level security;
alter table pipeline_runs enable row level security;

-- Public read access (the site is public)
create policy "Public read clinics" on clinics for select using (true);
create policy "Public read doctors" on doctors for select using (true);
create policy "Public read posts" on posts for select using (true);
create policy "Public read rankings" on rankings for select using (true);
create policy "Public read queue" on queue_state for select using (true);
create policy "Public read runs" on pipeline_runs for select using (true);

-- Insert/update via service role key only (the orchestrator)
-- No anonymous insert policies — the orchestrator uses the service_role key
