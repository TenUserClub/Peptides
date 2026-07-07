// Daily rank tracking via DataForSEO SERP API (live/regular).
// Reads pipeline/queue/keywords.json → appends to pipeline/data/rankings.csv
// Usage: node rank-track.mjs
import { join } from 'node:path';
import { appendFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnv, requireEnv, readJson, log, PIPELINE } from './lib.mjs';

loadEnv();
const LOGIN = requireEnv('DATAFORSEO_LOGIN');
const PASSWORD = requireEnv('DATAFORSEO_PASSWORD');
const DOMAIN = requireEnv('SITE_DOMAIN'); // e.g. yourdomain.com

const kw = readJson(join(PIPELINE, 'queue', 'keywords.json'), { keywords: [] });
if (kw.keywords.length === 0) {
  log('info', 'rank-track: no keywords in queue/keywords.json yet');
  process.exit(0);
}

const auth = 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64');
const csvPath = join(PIPELINE, 'data', 'rankings.csv');
mkdirSync(dirname(csvPath), { recursive: true });
if (!existsSync(csvPath)) writeFileSync(csvPath, 'date,keyword,position,url\n');

const today = new Date().toISOString().slice(0, 10);
for (const keyword of kw.keywords) {
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify([{ keyword, location_code: 2840, language_code: 'en', depth: 100 }]),
  });
  if (!res.ok) { log('error', `rank-track ${keyword}: HTTP ${res.status}`); continue; }
  const data = await res.json();
  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  const hit = items.find((i) => (i.domain ?? '').includes(DOMAIN));
  appendFileSync(csvPath, `${today},"${keyword}",${hit ? hit.rank_absolute : ''},${hit ? `"${hit.url}"` : ''}\n`);
  log('info', `rank-track: ${keyword} → ${hit ? `#${hit.rank_absolute}` : 'not in top 100'}`);
}
