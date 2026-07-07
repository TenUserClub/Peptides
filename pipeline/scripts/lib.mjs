// Shared helpers for pipeline scripts. Node 18+, no dependencies.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PIPELINE = join(ROOT, 'pipeline');

export function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    log('error', `Missing ${name}. Add it to .env (see .env.example).`);
    process.exit(1);
  }
  return v;
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  console.log(line);
  mkdirSync(join(PIPELINE, 'logs'), { recursive: true });
  appendFileSync(join(PIPELINE, 'logs', `${new Date().toISOString().slice(0, 10)}.log`), line + '\n');
}

export function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
