import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('the all stage always verifies and monitors on the six-hour schedule', () => {
  const orchestrator = read('pipeline/orchestrator.mjs');
  assert.match(orchestrator, /stage === 'all' \|\| stage === 'verify'\) await runVerify\(\)/);
  assert.match(orchestrator, /stage === 'all' \|\| stage === 'monitor'\) await runMonitor\(\)/);
  assert.doesNotMatch(orchestrator, /stage === 'all' && hour [<>]=?/);
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

test('the preflight covers all five deployable roots', () => {
  const preflight = read('pipeline/scripts/preflight.mjs');
  for (const rootPath of ['site', 'sites/doctors', 'sites/content', 'sites/news', 'sites/updates']) {
    assert.ok(preflight.includes(`'${rootPath}'`), `${rootPath} is not checked`);
  }
});
