-- Align the optional Supabase schema with the current six content collections.
alter table posts drop constraint if exists posts_collection_check;
alter table posts add constraint posts_collection_check
  check (collection in ('news', 'clinics', 'doctors', 'legal', 'blog', 'updates'));

-- The websites are static and do not query Supabase directly. Keep operational
-- records private and access them only with the server-side service_role key.
drop policy if exists "Public read clinics" on clinics;
drop policy if exists "Public read doctors" on doctors;
drop policy if exists "Public read posts" on posts;
drop policy if exists "Public read rankings" on rankings;
drop policy if exists "Public read queue" on queue_state;
drop policy if exists "Public read runs" on pipeline_runs;

revoke all on table clinics from anon, authenticated;
revoke all on table doctors from anon, authenticated;
revoke all on table posts from anon, authenticated;
revoke all on table rankings from anon, authenticated;
revoke all on table queue_state from anon, authenticated;
revoke all on table pipeline_runs from anon, authenticated;
