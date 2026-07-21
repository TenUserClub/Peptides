#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, ROOT } from './lib.mjs';
import { validateSupabaseUrl, GOOGLE_OAUTH_TOKEN_URL } from '../lib/security.mjs';

loadEnv();

const checkSupabase = process.argv.includes('--check-supabase');
const allowMissingRequired = process.argv.includes('--allow-missing-required');
const requireSupabase = process.env.REQUIRE_SUPABASE === 'true';
const errors = [];
const notices = [];

function validatePositiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) errors.push(`${name} must be a positive integer`);
  return value;
}

function present(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && !value.startsWith('#'));
}

for (const name of ['OPENAI_API_KEY', 'EXA_API_KEY']) {
  if (!present(name) && !allowMissingRequired) errors.push(`Missing required environment variable: ${name}`);
}

for (const [name, fallback] of [
  ['OPENAI_MAX_CALLS_PER_RUN', 30],
  ['OPENAI_MAX_OUTPUT_TOKENS_PER_RUN', 60000],
  ['OPENAI_TIMEOUT_MS', 90000],
  ['GEMINI_MAX_CALLS_PER_RUN', 10],
  ['GEMINI_TIMEOUT_MS', 120000],
  ['EXA_MAX_REQUESTS_PER_RUN', 5],
  ['EXA_TIMEOUT_MS', 30000],
]) validatePositiveInteger(name, fallback);

const autoPush = process.env.AUTO_PUSH?.trim() || 'false';
if (!['true', 'false'].includes(autoPush)) errors.push('AUTO_PUSH must be either true or false');

const siteDomain = process.env.SITE_DOMAIN?.trim() || 'mypeptide.club';
if (!/^[a-z0-9.-]+$/i.test(siteDomain) || siteDomain.includes('..')) {
  errors.push('SITE_DOMAIN must be a hostname without a protocol or path');
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseKey = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
).trim();
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  errors.push('Set SUPABASE_URL with either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY, or leave all unset');
}
if (requireSupabase && (!supabaseUrl || !supabaseKey)) {
  errors.push('REQUIRE_SUPABASE=true requires SUPABASE_URL and a Supabase server secret key');
}
if (supabaseUrl) {
  const validation = validateSupabaseUrl(supabaseUrl);
  if (!validation.ok) errors.push(validation.error);
}

const projects = ['site', 'sites/doctors', 'sites/content', 'sites/news', 'sites/updates'];
for (const project of projects) {
  for (const file of ['package.json', 'vercel.json']) {
    if (!existsSync(join(ROOT, project, file))) errors.push(`${project}/${file} is missing`);
  }
}

for (const [name, listKey, requiresNext] of [['cities', 'cities', true], ['states', 'states', true], ['keywords', 'keywords', false]]) {
  const path = join(ROOT, 'pipeline', 'queue', `${name}.json`);
  try {
    const queue = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(queue[listKey])) errors.push(`${name}.json is missing the ${listKey} array`);
    if (requiresNext && (!Number.isInteger(queue.next) || queue.next < 0)) errors.push(`${name}.json has an invalid next pointer`);
  } catch (error) {
    errors.push(`${name}.json could not be parsed: ${error.message}`);
  }
}

try {
  const blogQueue = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'queue', 'blog-topics.json'), 'utf8'));
  if (!Array.isArray(blogQueue.topics) || blogQueue.topics.length === 0) {
    errors.push('blog-topics.json is missing a non-empty topics array');
  } else {
    const ids = new Set();
    for (const topic of blogQueue.topics) {
      if (!topic.id || !topic.title || !topic.keyword || !topic.category || !topic.intent) {
        errors.push('Every blog topic needs id, title, keyword, category, and intent');
        break;
      }
      if (ids.has(topic.id)) errors.push(`Duplicate blog topic id: ${topic.id}`);
      ids.add(topic.id);
      if (!Array.isArray(topic.sourceUrls) || topic.sourceUrls.length < 2) {
        errors.push(`Blog topic ${topic.id} needs at least two source URLs`);
      }
    }
  }
} catch (error) {
  errors.push(`blog-topics.json could not be parsed: ${error.message}`);
}

if (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  notices.push('SUPABASE_SERVICE_KEY is supported for compatibility; rename it to SUPABASE_SECRET_KEY');
}

const searchConsoleEncoded = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64?.trim() || '';
if (searchConsoleEncoded) {
  try {
    const account = JSON.parse(Buffer.from(searchConsoleEncoded, 'base64').toString('utf8'));
    if (!account.client_email || !account.private_key) errors.push('Search Console service account JSON is missing client_email or private_key');
    if (account.token_uri && account.token_uri !== GOOGLE_OAUTH_TOKEN_URL) errors.push(`Search Console token_uri must be ${GOOGLE_OAUTH_TOKEN_URL}`);
  } catch (error) {
    errors.push(`GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64 is invalid: ${error.message}`);
  }
}

if (checkSupabase && supabaseUrl && supabaseKey && errors.length === 0) {
  try {
    const controlRequired = process.env.SUPABASE_CONTROL_PLANE_REQUIRED === 'true';
    const tables = [
      ...['pipeline_runs', 'keyword_registry'].map((table) => ({ table, required: true })),
      ...['publication_queue', 'integrity_checks'].map((table) => ({ table, required: controlRequired })),
    ];
    for (const { table, required } of tables) {
      const headers = { apikey: supabaseKey };
      if (!supabaseKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${supabaseKey}`;
      const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?select=id&limit=1`, { headers });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        const message = `Supabase ${table} migration check failed with HTTP ${response.status}: ${detail}`;
        if (required) errors.push(message);
        else notices.push(`${message}; apply migration 004 to enable publication integrity control`);
      } else {
        notices.push(`Supabase ${table} table verified`);
      }
    }
  } catch (error) {
    const detail = error.cause?.code || error.code || error.message;
    errors.push(`Supabase connection check failed: ${detail}`);
  }
}

if (errors.length) {
  console.error('Automation preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Automation preflight passed.');
console.log(`- Required pipeline keys: ${allowMissingRequired && (!present('OPENAI_API_KEY') || !present('EXA_API_KEY')) ? 'structural check only' : 'available'}`);
console.log(`- Gemini images: ${present('GEMINI_API_KEY') ? 'enabled' : 'disabled (optional)'}`);
console.log(`- Supabase operational mirror: ${supabaseUrl && supabaseKey ? 'enabled' : 'disabled (optional)'}`);
console.log(`- Automatic push inside orchestrator: ${autoPush}`);
for (const notice of notices) console.log(`- ${notice}`);
