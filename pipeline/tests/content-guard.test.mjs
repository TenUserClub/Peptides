import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateContent } from '../lib/content-guard.mjs';

const words = (count) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');

test('accepts a sourced blog within the editorial word range', () => {
  const text = `---\ntitle: "Evidence guide"\ndescription: "A carefully sourced guide."\ncategory: "science"\ntags: ["education"]\nsources: ["https://www.fda.gov/drugs", "https://clinicaltrials.gov/study/example"]\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-17\n---\n${words(1050)}`;
  const result = validateContent({ text, collection: 'blog', filename: 'evidence-guide.md' });
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('blocks unsupported outcomes and weak news sources', () => {
  const text = `---\ntitle: "Claim"\ndescription: "Claim"\nsourceName: "Blog"\nsourceUrl: "https://example.com/story"\nsourceType: primary\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-17\n---\nPeptides offer significant benefits. ${words(420)}`;
  const result = validateContent({ text, collection: 'news', filename: 'claim.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unsupported|authoritative|example/i);
});

test('blocks sample files', () => {
  const text = `---\ntitle: "Sample"\ndescription: "Sample"\nweekOf: 2026-07-14\npublishDate: 2026-07-17\nauthor: "Peptide Atlas Editorial Team"\n---\n${words(200)}`;
  const result = validateContent({ text, collection: 'updates', filename: '_sample.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /sample/i);
});

test('blocks legacy section paths on the standalone news and updates domains', () => {
  const text = `---\ntitle: "Weekly review"\ndescription: "Weekly review"\nweekOf: 2026-07-14\npublishDate: 2026-07-17\nauthor: "Peptide Atlas Editorial Team"\n---\n[News](https://peptidesnews.us/news/fda-update/) [Updates](https://peptidesupdates.com/updates/week-28/) ${words(200)}`;
  const result = validateContent({ text, collection: 'updates', filename: 'week-28.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /root path/i);
});

test('requires a matching verified clinic record', () => {
  const root = mkdtempSync(join(tmpdir(), 'peptide-guard-'));
  mkdirSync(join(root, 'clinics'));
  writeFileSync(join(root, 'clinics', 'miami-clinic.json'), JSON.stringify({ verified: true }));
  const text = `---\ntitle: "Miami clinic"\ndescription: "Verified listing"\nclinicName: "Miami Clinic"\ncity: "Miami"\nstate: "FL"\nsources: ["https://clinic.example.org"]\nverified: true\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-17\n---\n${words(750)}`;
  const result = validateContent({ text, collection: 'clinics', filename: 'miami-clinic.md', verifiedRoot: root });
  assert.equal(result.ok, true, result.errors.join('; '));
});
