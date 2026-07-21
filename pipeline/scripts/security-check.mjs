#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { loadEnv, ROOT } from './lib.mjs';

loadEnv();

const errors = [];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean);
const forbiddenNames = /(^|\/)(\.env(?:\..+)?|[^/]*(?:credentials|service-account)[^/]*\.json|[^/]+\.(?:pem|key|p12|pfx))$/i;

for (const file of tracked) {
  if (file === '.env.example') continue;
  if (forbiddenNames.test(file.replaceAll('\\', '/'))) errors.push(`sensitive file is tracked: ${file}`);
}

const secretNames = [
  'OPENAI_API_KEY', 'EXA_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64',
];
const secretValues = secretNames.map((name) => process.env[name]).filter((value) => value && value.length >= 8);

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

for (const root of ['site', 'sites/doctors', 'sites/content', 'sites/news', 'sites/updates']) {
  const publicFiles = [
    ...filesUnder(join(ROOT, root, 'public')),
    ...filesUnder(join(ROOT, root, 'dist')),
  ];
  for (const file of publicFiles) {
    if (/\.(?:png|jpe?g|gif|webp|woff2?|ico)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const value of secretValues) {
      if (text.includes(value)) errors.push(`configured secret value leaked into public output: ${relative(ROOT, file)}`);
    }
    for (const name of secretNames) {
      if (text.includes(name)) errors.push(`server-only variable name leaked into public output: ${relative(ROOT, file)} (${name})`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log(`Security check passed: ${tracked.length} tracked files reviewed; no server credentials found in public assets.`);
