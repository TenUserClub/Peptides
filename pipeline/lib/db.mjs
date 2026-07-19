/**
 * Supabase client for the Peptide SEO pipeline.
 * Supabase helpers for run auditing and operational data services.
 * Markdown and JSON in the repository remain the pipeline source of truth.
 */

import { loadEnv, log } from '../scripts/lib.mjs';

loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
const REQUIRE_SUPABASE = process.env.REQUIRE_SUPABASE === 'true';

let supabase = null;
let enabled = false;

function dbFailure(operation, error) {
  const message = `db ${operation}: ${error?.message || error}`;
  if (REQUIRE_SUPABASE) throw new Error(message);
  log('error', message);
  return null;
}

// Gracefully handle missing @supabase/supabase-js package
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    // Dynamic import so the pipeline doesn't crash if the package isn't installed
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    enabled = true;
    log('info', 'db: Supabase client initialized');
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      log('warn', 'db: @supabase/supabase-js not installed. Run: npm install @supabase/supabase-js');
    } else {
      log('error', `db: Failed to initialize Supabase: ${e.message}`);
    }
  }
} else {
  log('info', 'db: Supabase not configured — running file-only mode');
}

export function isEnabled() {
  return enabled;
}

export async function checkConnection() {
  if (!enabled) return { enabled: false, ok: true, error: null };
  const { error } = await supabase.from('pipeline_runs').select('id', { head: true, count: 'exact' });
  return { enabled: true, ok: !error, error: error?.message || null };
}

// ── Clinics ─────────────────────────────────────────────────────

export async function insertClinic(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('clinics').insert(data).select().single();
  if (error) { log('error', `db insertClinic: ${error.message}`); return null; }
  return record;
}

export async function upsertClinic(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('clinics').upsert(data, { onConflict: 'slug' }).select().single();
  if (error) return dbFailure('upsertClinic', error);
  return record;
}

export async function updateClinic(id, data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('clinics').update(data).eq('id', id).select().single();
  if (error) { log('error', `db updateClinic: ${error.message}`); return null; }
  return record;
}

export async function getVerifiedClinics(opts = {}) {
  if (!enabled) return [];
  let q = supabase.from('clinics').select('*').eq('verified', true).eq('status', 'verified');
  if (opts.state) q = q.eq('state', opts.state);
  if (opts.city) q = q.eq('city', opts.city);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) { log('error', `db getVerifiedClinics: ${error.message}`); return []; }
  return data || [];
}

export async function getClinicsNeedingVerification(limit = 10) {
  if (!enabled) return [];
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('status', 'pending')
    .limit(limit);
  if (error) { log('error', `db getClinicsNeedingVerification: ${error.message}`); return []; }
  return data || [];
}

export async function getStaleClinics(days = 90) {
  if (!enabled) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('verified', true)
    .lt('verified_at', cutoff);
  if (error) { log('error', `db getStaleClinics: ${error.message}`); return []; }
  return data || [];
}

// ── Doctors ─────────────────────────────────────────────────────

export async function insertDoctor(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('doctors').insert(data).select().single();
  if (error) { log('error', `db insertDoctor: ${error.message}`); return null; }
  return record;
}

export async function upsertDoctor(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('doctors').upsert(data, { onConflict: 'slug' }).select().single();
  if (error) return dbFailure('upsertDoctor', error);
  return record;
}

export async function getVerifiedDoctors(opts = {}) {
  if (!enabled) return [];
  let q = supabase.from('doctors').select('*').eq('verified', true).eq('status', 'verified');
  if (opts.state) q = q.eq('state', opts.state);
  if (opts.specialty) q = q.eq('specialty', opts.specialty);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) { log('error', `db getVerifiedDoctors: ${error.message}`); return []; }
  return data || [];
}

// ── Posts ───────────────────────────────────────────────────────

export async function insertPost(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('posts').insert(data).select().single();
  if (error) { log('error', `db insertPost: ${error.message}`); return null; }
  return record;
}

export async function upsertPublishedPost(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase
    .from('posts')
    .upsert(data, { onConflict: 'slug,collection' })
    .select()
    .single();
  if (error) return dbFailure('upsertPublishedPost', error);
  return record;
}

export async function getPostsByCollection(collection, opts = {}) {
  if (!enabled) return [];
  let q = supabase.from('posts').select('*').eq('collection', collection).eq('published', true);
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.order) q = q.order(opts.order, { ascending: opts.asc ?? false });
  const { data, error } = await q;
  if (error) { log('error', `db getPostsByCollection: ${error.message}`); return []; }
  return data || [];
}

export async function countPostsToday(collection) {
  if (!enabled) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('collection', collection)
    .eq('publish_date', today);
  if (error) { log('error', `db countPostsToday: ${error.message}`); return 0; }
  return count || 0;
}

export async function getPostTitles(collection) {
  if (!enabled) return [];
  const { data, error } = await supabase
    .from('posts')
    .select('title')
    .eq('collection', collection)
    .eq('published', true);
  if (error) { log('error', `db getPostTitles: ${error.message}`); return []; }
  return (data || []).map((r) => r.title);
}

// ── Rankings ────────────────────────────────────────────────────

export async function insertRanking(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('rankings').insert(data).select().single();
  if (error) { log('error', `db insertRanking: ${error.message}`); return null; }
  return record;
}

export async function getRankingsForKeyword(keyword, days = 30) {
  if (!enabled) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('keyword', keyword)
    .gte('checked_at', cutoff)
    .order('checked_at', { ascending: true });
  if (error) { log('error', `db getRankingsForKeyword: ${error.message}`); return []; }
  return data || [];
}

export async function upsertKeywordMetrics(rows) {
  if (!enabled || !rows.length) return 0;
  let saved = 0;
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await supabase
      .from('keyword_registry')
      .upsert(chunk, { onConflict: 'property,keyword,period_end' });
    if (error) {
      dbFailure('upsertKeywordMetrics', error);
      return saved;
    }
    saved += chunk.length;
  }
  return saved;
}

export async function getKeywordSignals(limit = 2000) {
  if (!enabled) return [];
  const cutoff = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('keyword_registry')
    .select('keyword,clicks,impressions,ctr,position,property,checked_at')
    .eq('source', 'google_search_console')
    .gte('checked_at', cutoff)
    .order('impressions', { ascending: false })
    .limit(limit);
  if (error) {
    dbFailure('getKeywordSignals', error);
    return [];
  }
  return data || [];
}

export async function pruneKeywordMetrics(retentionDays = 90) {
  if (!enabled) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('keyword_registry')
    .delete()
    .lt('period_end', cutoff)
    .select('id');
  if (error) return dbFailure('pruneKeywordMetrics', error) || 0;
  return data?.length || 0;
}

// ── Queue State ─────────────────────────────────────────────────

export async function getQueueState(queueName) {
  if (!enabled) return null;
  const { data, error } = await supabase.from('queue_state').select('*').eq('queue_name', queueName).single();
  if (error && error.code !== 'PGRST116') { log('error', `db getQueueState: ${error.message}`); return null; }
  return data || null;
}

export async function setQueueState(queueName, data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase
    .from('queue_state')
    .upsert({ queue_name: queueName, ...data, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return dbFailure('setQueueState', error);
  return record;
}

// ── Pipeline Runs ───────────────────────────────────────────────

export async function startRun(stage, opts = {}) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('pipeline_runs').insert({
    stage,
    status: 'running',
    dry_run: opts.dryRun || false,
    model_used: opts.model || null,
  }).select().single();
  if (error) return dbFailure('startRun', error);
  return record;
}

export async function finishRun(id, status, summary, errorMessage = null) {
  if (!enabled || !id) return null;
  const { error } = await supabase.from('pipeline_runs').update({
    status,
    finished_at: new Date().toISOString(),
    log_summary: summary,
    error_message: errorMessage,
  }).eq('id', id);
  if (error) dbFailure('finishRun', error);
}

// ── Stats / Dashboard ───────────────────────────────────────────

export async function getDashboardStats() {
  if (!enabled) return null;
  const today = new Date().toISOString().slice(0, 10);

  const [clinicsRes, doctorsRes, postsRes, runsRes] = await Promise.all([
    supabase.from('clinics').select('*', { count: 'exact', head: true }).eq('verified', true),
    supabase.from('doctors').select('*', { count: 'exact', head: true }).eq('verified', true),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('published', true),
    supabase.from('pipeline_runs').select('*', { count: 'exact', head: true }).gte('started_at', today),
  ]);

  return {
    verifiedClinics: clinicsRes.count || 0,
    verifiedDoctors: doctorsRes.count || 0,
    publishedPosts: postsRes.count || 0,
    runsToday: runsRes.count || 0,
    errors: (runsRes.data || []).filter((r) => r.status === 'failed').length,
  };
}
