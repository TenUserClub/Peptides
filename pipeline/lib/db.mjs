/**
 * Supabase client for the Peptide SEO pipeline.
 * Optional — the pipeline works file-only if SUPABASE_URL is not set
 * or if @supabase/supabase-js is not installed.
 * If set, queue state, verified records, rankings, and post metadata
 * are persisted to Postgres instead of JSON/CSV files.
 */

import { loadEnv, log } from '../scripts/lib.mjs';

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

let supabase = null;
let enabled = false;

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

// ── Clinics ─────────────────────────────────────────────────────

export async function insertClinic(data) {
  if (!enabled) return null;
  const { data: record, error } = await supabase.from('clinics').insert(data).select().single();
  if (error) { log('error', `db insertClinic: ${error.message}`); return null; }
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
  if (error) { log('error', `db setQueueState: ${error.message}`); return null; }
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
  if (error) { log('error', `db startRun: ${error.message}`); return null; }
  return record;
}

export async function finishRun(id, status, summary) {
  if (!enabled) return null;
  const { error } = await supabase.from('pipeline_runs').update({
    status,
    finished_at: new Date().toISOString(),
    log_summary: summary,
  }).eq('id', id);
  if (error) { log('error', `db finishRun: ${error.message}`); }
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
