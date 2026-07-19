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

test('allows neutral discussion of research chemicals and approved treatment indications', () => {
  const text = `---\ntitle: "Research and approved products"\ndescription: "A sourced regulatory explanation"\ncategory: "beginners"\nsources: ["https://www.fda.gov/drugs", "https://clinicaltrials.gov/search"]\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-19\n---\n${words(1000)} The term research chemical appears in regulatory discussions. An FDA-approved medicine may treat a labeled condition. Peptides do not cure every disease.`;
  const result = validateContent({ text, collection: 'blog', filename: 'research-products.md' });
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('allows sourced discussion of misleading cure claims', () => {
  const text = `---\ntitle: "Claim review"\ndescription: "A sourced review"\ncategory: "safety"\nsources: ["https://www.fda.gov/drugs", "https://clinicaltrials.gov/search"]\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-19\n---\n${words(1000)} Some sellers market peptide therapy as a cure for chronic disease, but the FDA warns readers to check whether a product is approved.`;
  const result = validateContent({ text, collection: 'blog', filename: 'claim-review.md' });
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('accepts a concise link-based weekly digest', () => {
  const text = `---\ntitle: "Weekly review"\ndescription: "A concise weekly review"\nweekOf: 2026-07-14\npublishDate: 2026-07-19\nauthor: "Peptide Atlas Editorial Team"\n---\n${words(90)}`;
  const result = validateContent({ text, collection: 'updates', filename: '2026-w30.md' });
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('blocks appended humaniser audits and decorative separators', () => {
  const text = `---\ntitle: "Weekly review"\ndescription: "Weekly review"\nweekOf: 2026-07-14\npublishDate: 2026-07-17\nauthor: "Peptide Atlas Editorial Team"\n---\n${words(200)}\n\n---\n\nWord count (input): 193`;
  const result = validateContent({ text, collection: 'updates', filename: 'week-28.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /editing notes|thematic break/i);
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

test('blocks copied AI artifacts, placeholders, and model tracking links', () => {
  const text = `---\ntitle: "Weekly review"\ndescription: "Weekly review"\nweekOf: 2026-07-14\npublishDate: 2026-07-17\nauthor: "Peptide Atlas Editorial Team"\n---\nA claim appears here [cite: 1] with INSERT_SOURCE_URL and https://www.fda.gov/drugs?utm_source=chatgpt.com. ${words(200)}`;
  const result = validateContent({ text, collection: 'updates', filename: 'week-28.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /artifacts|placeholder|tracking/i);
});

test('blocks strong formulaic constructions and vague attribution', () => {
  const text = `---\ntitle: "Weekly review"\ndescription: "Weekly review"\nweekOf: 2026-07-14\npublishDate: 2026-07-17\nauthor: "Peptide Atlas Editorial Team"\n---\n## Key takeaways\n\nThis update stands as a testament to progress. It is not only useful but also pivotal. Experts say the evolving landscape offers valuable insights. ${words(200)}`;
  const result = validateContent({ text, collection: 'updates', filename: 'week-28.md' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /formulaic|vague attribution/i);
});

test('requires a matching verified clinic record', () => {
  const root = mkdtempSync(join(tmpdir(), 'peptide-guard-'));
  mkdirSync(join(root, 'clinics'));
  writeFileSync(join(root, 'clinics', 'miami-clinic.json'), JSON.stringify({ verified: true }));
  const text = `---\ntitle: "Miami clinic"\ndescription: "Verified listing"\nclinicName: "Miami Clinic"\ncity: "Miami"\nstate: "FL"\nsources: ["https://clinic.example.org"]\nverified: true\nauthor: "Peptide Atlas Editorial Team"\npublishDate: 2026-07-17\n---\n${words(750)}`;
  const result = validateContent({ text, collection: 'clinics', filename: 'miami-clinic.md', verifiedRoot: root });
  assert.equal(result.ok, true, result.errors.join('; '));
});
