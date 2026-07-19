import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBlogPost, canonicalClinicPost, chooseSingleNpiMatch, normalizeEditorialText, normalizeHttpUrl } from '../lib/pipeline-utils.mjs';

test('normalizes bare and protocol-relative website URLs', () => {
  assert.equal(normalizeHttpUrl('www.example.com/path'), 'https://www.example.com/path');
  assert.equal(normalizeHttpUrl('//example.com/path'), 'https://example.com/path');
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), '');
});

test('normalizes cross-site routes and removes em dashes after editing', () => {
  const result = normalizeEditorialText('Read [news](https://peptidesnews.us/news/update/) — then [clinics](/clinics/austin/).');
  assert.equal(result, 'Read [news](https://peptidesnews.us/update/) , then [clinics](https://mypeptide.club/clinics/austin/).');
});

test('selects only an unambiguous NPI match for the requested place', () => {
  const matches = [
    { npi: '1', status: 'A', addresses: [{ city: 'Miami', state: 'FL' }] },
    { npi: '2', status: 'A', addresses: [{ city: 'Orlando', state: 'FL' }] },
  ];
  assert.equal(chooseSingleNpiMatch(matches, { state: 'FL', city: 'Miami' })?.npi, '1');
  assert.equal(chooseSingleNpiMatch(matches, { state: 'FL' }), null);
});

test('locks generated blog frontmatter to the approved editorial brief', () => {
  const result = canonicalBlogPost({
    parsed: {
      data: { title: 'Changed title', description: 'A useful description.', category: 'wrong', tags: ['FDA'] },
      body: 'A complete article body.',
    },
    topic: { title: "What is peptide therapy? A source-led beginner's guide", category: 'beginners' },
    approvedSources: ['https://www.fda.gov/example', 'https://clinicaltrials.gov/example'],
    today: '2026-07-19',
  });
  assert.match(result, /title: "What is peptide therapy\? A source-led beginner's guide"/);
  assert.match(result, /category: "beginners"/);
  assert.match(result, /sources: \["https:\/\/www\.fda\.gov\/example","https:\/\/clinicaltrials\.gov\/example"\]/);
  assert.doesNotMatch(result, /Changed title|category: "wrong"/);
});

test('builds clinic frontmatter from the verified record, not model output', () => {
  const result = canonicalClinicPost({
    parsed: { data: { description: 'A factual clinic profile — with sources.' }, body: 'Clinic body.' },
    record: {
      clinicName: 'Test Health', city: 'Austin', state: 'TX', website: 'testhealth.example/path',
      sourceUrls: ['https://testhealth.example/path'], services: ['Peptide consultations'], verified: true,
    },
    today: '2026-07-19',
  });
  assert.match(result, /clinicName: "Test Health"/);
  assert.match(result, /sources: \["https:\/\/testhealth\.example\/path"\]/);
  assert.match(result, /verified: true/);
  assert.doesNotMatch(result, /—/);
});
