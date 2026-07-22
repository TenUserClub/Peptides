import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEWS_DISCOVERY_LANES,
  canonicalSourceUrl,
  isUsablePrimaryText,
  peptideRelevanceScore,
  primaryDocumentFetchUrl,
  primarySourceProfile,
  requiredCollectionForStory,
  sourcePublishedDateFromText,
} from '../lib/news-sources.mjs';

test('news discovery uses five bounded primary-source lanes', () => {
  assert.equal(NEWS_DISCOVERY_LANES.length, 5);
  assert.deepEqual(
    NEWS_DISCOVERY_LANES.map((lane) => lane.id),
    ['us-regulation-safety', 'us-enforcement-courts', 'clinical-research', 'international-regulators', 'official-industry-disclosures']
  );
  for (const lane of NEWS_DISCOVERY_LANES) {
    assert.ok(lane.lookbackDays >= 14 && lane.lookbackDays <= 45);
    assert.ok(lane.includeDomains.length >= 3);
  }
});

test('primary-source profiles separate legal, research, registry, and company support', () => {
  const fda = primarySourceProfile('https://www.fda.gov/drugs/guidance-compliance-regulatory-information/human-drug-compounding');
  assert.equal(fda.sourceClass, 'government');
  assert.deepEqual(fda.collections, ['news', 'legal']);

  const pubmed = primarySourceProfile('https://pubmed.ncbi.nlm.nih.gov/32622810/');
  assert.equal(pubmed.sourceClass, 'research');
  assert.deepEqual(pubmed.collections, ['news']);

  const trial = primarySourceProfile('https://clinicaltrials.gov/study/NCT01234567');
  assert.equal(trial.sourceClass, 'trial-registry');
  assert.deepEqual(trial.collections, ['news']);

  const company = primarySourceProfile('https://www.lilly.com/news/stories/example-update');
  assert.equal(company.sourceClass, 'company');
  assert.deepEqual(company.collections, ['news']);
});

test('search pages and unapproved publishers are not primary documents', () => {
  assert.equal(primarySourceProfile('https://pubmed.ncbi.nlm.nih.gov/?term=peptide').primary, false);
  assert.equal(primarySourceProfile('https://clinicaltrials.gov/search?term=peptide').primary, false);
  assert.equal(primarySourceProfile('https://example.com/peptide-news').authoritative, false);
});

test('canonical source URLs remove tracking without changing document identity', () => {
  assert.equal(
    canonicalSourceUrl('http://www.fda.gov/example/document/?utm_source=test&ref=newsletter#section'),
    'https://www.fda.gov/example/document'
  );
});

test('official APIs are used to retrieve Federal Register and ClinicalTrials documents', () => {
  assert.equal(
    primaryDocumentFetchUrl('https://www.federalregister.gov/documents/2026/07/21/2026-14692/example-document'),
    'https://www.federalregister.gov/api/v1/documents/2026-14692.json'
  );
  assert.equal(
    primaryDocumentFetchUrl('https://clinicaltrials.gov/study/NCT01234567'),
    'https://clinicaltrials.gov/api/v2/studies/NCT01234567'
  );
});

test('relevance and usable-text checks reject generic or access-control results', () => {
  assert.equal(peptideRelevanceScore({ title: 'General pharmacy policy', text: 'A generic policy update.' }), 0);
  assert.ok(peptideRelevanceScore({ title: 'FDA issues semaglutide compounding update' }) > 0);
  assert.equal(isUsablePrimaryText('Request Access Due to aggressive automated scraping. Complete the CAPTCHA. '.repeat(20)), false);
  assert.equal(isUsablePrimaryText('The FDA document discusses semaglutide and GLP-1 medicines. '.repeat(20)), true);
});

test('enforcement and Federal Register records route deterministically to legal', () => {
  assert.equal(requiredCollectionForStory({
    title: 'CVS reaches settlement over insulin dispensing allegations',
    url: 'https://oig.hhs.gov/fraud/enforcement/example-settlement',
  }), 'legal');
  assert.equal(requiredCollectionForStory({
    title: 'Semaglutide approved for an additional indication',
    url: 'https://www.gov.uk/government/news/semaglutide-approved',
  }), 'news');
  assert.equal(requiredCollectionForStory({
    title: 'Federal Register document',
    url: 'https://www.federalregister.gov/documents/2026/07/21/2026-14692/example',
  }), 'legal');
});

test('source dates prefer the primary document over discovery metadata', () => {
  assert.equal(sourcePublishedDateFromText('Published: 3 July 2026', '2026-07-04T00:00:00Z'), '2026-07-03');
  assert.equal(sourcePublishedDateFromText('July 9, 2026; State of Minnesota', '2026-07-10T00:00:00Z'), '2026-07-09');
  assert.equal(sourcePublishedDateFromText('{"publication_date":"2026-07-21"}', '2026-07-20T00:00:00Z'), '2026-07-21');
  assert.equal(sourcePublishedDateFromText('No visible date', '2026-07-08T00:00:00Z'), '2026-07-08');
});
