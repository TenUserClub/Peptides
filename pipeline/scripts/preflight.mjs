#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, ROOT } from './lib.mjs';

loadEnv();

const checkSupabase = process.argv.includes('--check-supabase');
const allowMissingRequired = process.argv.includes('--allow-missing-required');
const errors = [];
const notices = [];

function present(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && !value.startsWith('#'));
}

for (const name of ['OPENAI_API_KEY', 'EXA_API_KEY']) {
  if (!present(name) && !allowMissingRequired) errors.push(`Missing required environment variable: ${name}`);
}

const autoPush = process.env.AUTO_PUSH?.trim() || 'false';
if (!['true', 'false'].includes(autoPush)) errors.push('AUTO_PUSH must be either true or false');

const siteDomain = process.env.SITE_DOMAIN?.trim() || 'mypeptide.club';
if (!/^[a-z0-9.-]+$/i.test(siteDomain) || siteDomain.includes('..')) {
  errors.push('SITE_DOMAIN must be a hostname without a protocol or path');
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  errors.push('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both unset');
}
if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:') errors.push('SUPABASE_URL must use https');
  } catch {
    errors.push('SUPABASE_URL is not a valid URL');
  }
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

if (process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  notices.push('SUPABASE_SERVICE_KEY is supported for compatibility; rename it to SUPABASE_SERVICE_ROLE_KEY');
}

if (checkSupabase && supabaseUrl && supabaseKey && errors.length === 0) {
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/pipeline_runs?select=id&limit=1`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      errors.push(`Supabase connection or migration check failed with HTTP ${response.status}: ${detail}`);
    } else {
      notices.push('Supabase connection and pipeline_runs table verified');
    }
  } catch (error) {
    errors.push(`Supabase connection check failed: ${error.message}`);
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
console.log(`- Supabase audit: ${supabaseUrl && supabaseKey ? 'enabled' : 'disabled (optional)'}`);
console.log(`- Automatic push inside orchestrator: ${autoPush}`);
for (const notice of notices) console.log(`- ${notice}`);
