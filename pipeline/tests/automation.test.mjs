import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('the all stage verifies and monitors on the three-times-daily schedule', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  const workflow = read('.github/workflows/pipeline.yml');
  assert.match(orchestrator, /stage === 'all' \|\| stage === 'verify'\) outcome\.verified \+= await runVerify\(\)/);
  assert.match(orchestrator, /stage === 'all' \|\| stage === 'monitor'\) await runMonitor\(\)/);
  assert.doesNotMatch(orchestrator, /stage === 'all' && hour [<>]=?/);
  assert.match(workflow, /cron: "23 2,10,18 \* \* \*"/);
});

test('GitHub validates generated content before pushing it', () => {
  const workflow = read('.github/workflows/pipeline.yml');
  const pipelineIndex = workflow.indexOf('run: node pipeline/orchestrator.mjs all');
  const validationIndex = workflow.indexOf('run: npm run check');
  const pushIndex = workflow.indexOf('run: git push origin HEAD:');
  assert.ok(pipelineIndex >= 0, 'pipeline step is missing');
  assert.ok(validationIndex > pipelineIndex, 'validation must run after generation');
  assert.ok(pushIndex > validationIndex, 'push must run after validation');
  assert.match(workflow, /AUTO_PUSH: "false"/);
  assert.match(workflow, /default: true/);
});

test('dry runs do not write Supabase run records', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  assert.match(orchestrator, /const runRecord = DRY_RUN\s*\? null\s*:\s*await startRun/);
  assert.match(orchestrator, /if \(!DRY_RUN\) await finishRun/);
});

test('the preflight covers all five deployable roots', () => {
  const preflight = read('pipeline/scripts/preflight.mjs');
  for (const rootPath of ['site', 'sites/doctors', 'sites/content', 'sites/news', 'sites/updates']) {
    assert.ok(preflight.includes(`'${rootPath}'`), `${rootPath} is not checked`);
  }
});

test('blog writing uses the maintained topic queue and the humaniser covers blogs', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  const humaniser = read('pipeline/prompts/humanise.md');
  const queue = JSON.parse(read('pipeline/queue/blog-topics.json'));
  assert.ok(queue.topics.length >= 30, 'the seed editorial map should cover at least one month');
  assert.match(orchestrator, /queue', 'blog-topics\.json'/);
  assert.match(orchestrator, /topic\.status === 'ready'/);
  assert.match(orchestrator, /topic\.sourceUrls/);
  assert.match(orchestrator, /readableText\(sourceText\)/);
  assert.match(orchestrator, /keywordOpportunityScore/);
  assert.match(humaniser, /clinics,doctors,news,legal,blog,updates/);
});

test('Supabase and the free Search Console registry are wired into live runs', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  const workflow = read('.github/workflows/pipeline.yml');
  const migration = read('supabase/migrations/003_keyword_registry.sql');
  assert.match(orchestrator, /runSyncKeywords\(\)/);
  assert.match(orchestrator, /upsertPublishedPost/);
  assert.match(orchestrator, /upsertClinic/);
  assert.match(orchestrator, /upsertDoctor/);
  assert.match(orchestrator, /pruneKeywordMetrics\(90\)/);
  assert.match(workflow, /REQUIRE_SUPABASE: "true"/);
  assert.match(workflow, /SUPABASE_SECRET_KEY/);
  assert.match(workflow, /GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64/);
  assert.match(migration, /create table if not exists keyword_registry/);
});

test('Supabase controls the publication queue with content and integrity snapshots', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  const integrity = read('pipeline/lib/integrity.mjs');
  const db = read('pipeline/lib/db.mjs');
  const preflight = read('pipeline/scripts/preflight.mjs');
  const workflow = read('.github/workflows/pipeline.yml');
  const migration = read('supabase/migrations/004_publication_control.sql');
  assert.match(orchestrator, /syncPublicationIntegrity/);
  assert.match(orchestrator, /outcome\.mirrored/);
  assert.match(integrity, /content_sha256/);
  assert.match(integrity, /source_context/);
  assert.match(integrity, /mirrorMismatches/);
  assert.match(integrity, /checkPublicationControl/);
  assert.match(db, /withdrawPublicationQueueItems/);
  assert.match(preflight, /SUPABASE_CONTROL_PLANE_REQUIRED/);
  assert.match(migration, /create table if not exists publication_queue/);
  assert.match(migration, /create table if not exists integrity_checks/);
  assert.match(workflow, /REQUIRE_SUPABASE: "true"/);
  assert.match(workflow, /SUPABASE_CONTROL_PLANE_REQUIRED/);
});

test('external API calls have explicit per-run budgets and timeouts', () => {
  const llm = read('pipeline/lib/llm.mjs');
  const images = read('pipeline/lib/images.mjs');
  const exa = read('pipeline/scripts/exa-fetch.mjs');
  const workflow = read('.github/workflows/pipeline.yml');
  assert.match(llm, /MAX_OPENAI_CALLS_PER_RUN/);
  assert.match(llm, /MAX_OPENAI_OUTPUT_TOKENS_PER_RUN/);
  assert.match(llm, /AbortSignal\.timeout\(OPENAI_TIMEOUT_MS\)/);
  assert.match(images, /GEMINI_MAX_CALLS_PER_RUN/);
  assert.match(images, /AbortSignal\.timeout\(GEMINI_TIMEOUT_MS\)/);
  assert.match(exa, /EXA_MAX_REQUESTS_PER_RUN/);
  assert.match(exa, /AbortSignal\.timeout\(EXA_TIMEOUT_MS\)/);
  for (const setting of ['OPENAI_MAX_CALLS_PER_RUN', 'GEMINI_MAX_CALLS_PER_RUN', 'EXA_MAX_REQUESTS_PER_RUN']) {
    assert.ok(workflow.includes(setting), `${setting} is not explicit in the scheduled workflow`);
  }
});

test('zero-publication runs checkpoint verification and queue progress', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  assert.match(orchestrator, /publish: committed verification and queue checkpoint/);
  assert.match(orchestrator, /pipeline: checkpoint/);
  assert.match(orchestrator, /published=\$\{outcome\.published\}/);
});

test('Supabase queue checkpoints upsert on the queue name', () => {
  const db = read('pipeline/lib/db.mjs');
  assert.match(db, /onConflict: 'queue_name'/);
});

test('clinic and doctor writers share the combined directory limit', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  const combinedCount = /countToday\('clinics'\) \+ countToday\('doctors'\)/g;
  assert.ok((orchestrator.match(combinedCount) || []).length >= 3);
  assert.match(orchestrator, /const unpublishedFiles = verifiedFiles\.filter/);
  assert.match(orchestrator, /directoryDraftsThisRun/);
  assert.match(orchestrator, /groupedDoctors\.length >= 5/);
  assert.match(orchestrator, /doctors: \[doctor\], isRoundup: false/);
});

test('generated clinic images cannot masquerade as verified premises', () => {
  const images = read('pipeline/lib/images.mjs');
  const clinicPage = read('site/src/pages/clinics/[...id].astro');
  assert.match(images, /generic editorial illustration, not a depiction of a real clinic/);
  assert.match(images, /Do not invent signage/);
  assert.match(clinicPage, /not a verified photograph of the clinic or its premises/);
});

test('clinic frontmatter strips promotional outcome language from service labels', () => {
  const utils = read('pipeline/lib/pipeline-utils.mjs');
  assert.match(utils, /function neutralServiceLabel/);
  assert.match(utils, /including services and contact details from its verified record/);
});

test('the starter clinic queue covers all 50 US states once', () => {
  const queue = JSON.parse(read('pipeline/queue/cities.json'));
  const states = queue.cities.map((item) => item.state);
  assert.equal(queue.cities.length, 50);
  assert.equal(new Set(states).size, 50);
  assert.equal(queue.coveragePlan, 'One starter metro in every US state before a second geographic pass');
});

test('the starter doctor queue covers all 50 US states once', () => {
  const queue = JSON.parse(read('pipeline/queue/states.json'));
  const states = queue.states.map((item) => item.state);
  assert.equal(queue.states.length, 50);
  assert.equal(new Set(states).size, 50);
  assert.equal(queue.coveragePlan, 'One doctor discovery pass in every US state before repeating a state');
  assert.equal(queue.states[queue.next].state, 'California');
  assert.match(queue.inFlight.label, /^California\//);
});
