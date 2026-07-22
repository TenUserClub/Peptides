// Fetch raw material from the Exa API.
// Usage:
//   node exa-fetch.mjs news              → last-24h peptide news
//   node exa-fetch.mjs clinics           → clinics for the next city in queue/cities.json
//   node exa-fetch.mjs doctors           → doctors for the next state in queue/states.json
// Output: pipeline/data/exa/{mode}/{stamp}.json
// Queue contract (CLAUDE.md): the pointer advances only after a batch fully
// publishes — the publisher stage does that. This script only marks the batch
// in-flight. Exceptions handled here: empty results advance immediately
// (nothing will ever publish), and an in-flight batch older than STALE_DAYS is
// skipped with a warning so one bad city can't stall the belt.
import { join } from 'node:path';
import { loadEnv, requireEnv, readJson, writeJson, log, stamp, PIPELINE } from './lib.mjs';
import { NEWS_DISCOVERY_LANES } from '../lib/news-sources.mjs';

loadEnv();
const EXA_KEY = requireEnv('EXA_API_KEY');
const mode = process.argv[2];

async function exaSearch(query, opts = {}) {
  if (exaRequests >= EXA_MAX_REQUESTS_PER_RUN) {
    throw new Error(`Exa per-run request budget reached (${EXA_MAX_REQUESTS_PER_RUN})`);
  }
  exaRequests += 1;
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': EXA_KEY },
    body: JSON.stringify({
      query,
      numResults: opts.numResults ?? 10,
      type: 'auto',
      contents: { text: { maxCharacters: 4000 }, highlights: true },
      ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    }),
    signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

// Exa rate limit: 10 requests/second. Space out requests to stay well under.
const EXA_DELAY_MS = 200;
const EXA_MAX_REQUESTS_PER_RUN = Math.max(1, Number.parseInt(process.env.EXA_MAX_REQUESTS_PER_RUN || '5', 10) || 5);
const EXA_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.EXA_TIMEOUT_MS || '30000', 10) || 30000);
let exaRequests = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const STALE_DAYS = 3;

// Returns the queue item to fetch, or null if we should wait for the
// in-flight batch to publish. Mutates+saves the queue when skipping a stale batch.
function nextQueueItem(queue, qPath, listKey, label) {
  if (queue.inFlight) {
    const ageDays = (Date.now() - new Date(queue.inFlight.fetchedAt).getTime()) / 86_400_000;
    if (ageDays < STALE_DAYS) {
      log('info', `exa ${label}: batch for ${queue.inFlight.label} still in flight (${ageDays.toFixed(1)}d) — waiting for publisher to advance the queue`);
      return null;
    }
    log('warn', `exa ${label}: batch for ${queue.inFlight.label} stale after ${ageDays.toFixed(1)}d (nothing published) — skipping it; raw data kept in data/exa/`);
    queue.next += 1;
    delete queue.inFlight;
    writeJson(qPath, queue);
  }
  const item = queue[listKey][queue.next];
  if (!item) {
    log('info', `${label} queue exhausted — add more entries to queue/${listKey}.json`);
    return null;
  }
  return item;
}

// Empty result set: the batch is trivially complete, advance now.
// Non-empty: mark in-flight; the publisher advances the pointer after publish.
function recordFetch(queue, qPath, resultCount, outFile, label) {
  if (resultCount === 0) {
    queue.next += 1;
    delete queue.inFlight;
    log('warn', `exa: 0 results for ${label} — advancing queue past it (no batch to publish)`);
  } else {
    queue.inFlight = { label, file: outFile, fetchedAt: new Date().toISOString() };
  }
  writeJson(qPath, queue);
}

async function main() {
  if (mode === 'news') {
    const results = [];
    for (const lane of NEWS_DISCOVERY_LANES) {
      const since = new Date(Date.now() - lane.lookbackDays * 24 * 3600 * 1000).toISOString();
      const r = await exaSearch(lane.query, {
        numResults: 10,
        startPublishedDate: since,
        includeDomains: lane.includeDomains,
      });
      results.push({
        lane: lane.id,
        preferredCollection: lane.preferredCollection,
        lookbackDays: lane.lookbackDays,
        query: lane.query,
        includeDomains: lane.includeDomains,
        results: r.results ?? [],
      });
      await sleep(EXA_DELAY_MS); // rate limit spacing
    }
    const out = join(PIPELINE, 'data', 'exa', 'news', `${stamp()}.json`);
    writeJson(out, { fetchedAt: new Date().toISOString(), strategy: 'primary-source-lanes-v2', sets: results });
    log('info', `exa news: ${results.reduce((n, s) => n + s.results.length, 0)} results → ${out}`);
  } else if (mode === 'clinics') {
    const qPath = join(PIPELINE, 'queue', 'cities.json');
    const queue = readJson(qPath);
    const city = nextQueueItem(queue, qPath, 'cities', 'clinics');
    if (!city) return;
    const r = await exaSearch(
      `peptide therapy clinic "${city.city}" ${city.state} services doctors`,
      { numResults: 15 }
    );
    const results = r.results ?? [];
    const out = join(PIPELINE, 'data', 'exa', 'clinics', `${city.city.toLowerCase().replace(/\s+/g, '-')}-${city.state.toLowerCase()}-${stamp()}.json`);
    if (results.length > 0) writeJson(out, { city, fetchedAt: new Date().toISOString(), results });
    recordFetch(queue, qPath, results.length, out, `${city.city}, ${city.state}`);
    log('info', `exa clinics: ${city.city}, ${city.state}: ${results.length} results${results.length ? ` → ${out}` : ''}`);
  } else if (mode === 'doctors') {
    const qPath = join(PIPELINE, 'queue', 'states.json');
    const queue = readJson(qPath);
    const item = nextQueueItem(queue, qPath, 'states', 'doctors');
    if (!item) return;
    const r = await exaSearch(
      `${item.specialty} doctor physician ${item.state} clinic patient reviews`,
      { numResults: 20 }
    );
    const results = r.results ?? [];
    const out = join(PIPELINE, 'data', 'exa', 'doctors', `${item.state.toLowerCase()}-${item.specialty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}.json`);
    if (results.length > 0) writeJson(out, { item, fetchedAt: new Date().toISOString(), results });
    recordFetch(queue, qPath, results.length, out, `${item.state}/${item.specialty}`);
    log('info', `exa doctors: ${item.state}/${item.specialty}: ${results.length} results${results.length ? ` → ${out}` : ''}`);
  } else {
    console.error('Usage: node exa-fetch.mjs <news|clinics|doctors>');
    process.exit(1);
  }
}

main().catch((e) => {
  log('error', `exa-fetch ${mode}: ${e.message}`);
  process.exitCode = 1; // not process.exit(): let open handles drain (avoids a libuv abort on Windows)
});
