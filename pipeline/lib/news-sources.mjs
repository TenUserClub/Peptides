const GOVERNMENT_HOSTS = [
  'fda.gov',
  'hhs.gov',
  'cms.gov',
  'nih.gov',
  'justice.gov',
  'ftc.gov',
  'federalregister.gov',
  'regulations.gov',
  'govinfo.gov',
  'clinicaltrials.gov',
];

const INTERNATIONAL_REGULATOR_HOSTS = [
  'ema.europa.eu',
  'ec.europa.eu',
  'who.int',
  'gov.uk',
  'canada.ca',
  'tga.gov.au',
  'health.gov.au',
  'medsafe.govt.nz',
  'pmda.go.jp',
  'swissmedic.ch',
];

const RESEARCH_HOSTS = [
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'jamanetwork.com',
  'nejm.org',
  'thelancet.com',
  'nature.com',
  'science.org',
  'bmj.com',
];

const COMPANY_HOSTS = [
  'lilly.com',
  'novonordisk.com',
  'pfizer.com',
  'amgen.com',
  'roche.com',
  'regeneron.com',
  'boehringer-ingelheim.com',
  'astrazeneca.com',
  'sanofi.com',
  'merck.com',
  'gsk.com',
  'takeda.com',
];

function hostMatches(host, allowed) {
  return host === allowed || host.endsWith(`.${allowed}`);
}

function isGovernmentHost(host) {
  return GOVERNMENT_HOSTS.some((allowed) => hostMatches(host, allowed)) ||
    /(?:^|\.)gov(?:\.[a-z]{2})?$/.test(host) ||
    /(?:^|\.)mil$/.test(host);
}

function isAcademicHost(host) {
  return /(?:^|\.)edu(?:\.[a-z]{2})?$/.test(host);
}

function isSpecificSourceUrl(url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (url.hostname === 'pubmed.ncbi.nlm.nih.gov') return /^\/\d+$/.test(path);
  if (url.hostname === 'clinicaltrials.gov') return /^\/study\/NCT\d+$/i.test(path);
  if (url.hostname === 'federalregister.gov') return path !== '/' && !path.startsWith('/documents/search');
  return path !== '/' || Boolean(url.search);
}

export function canonicalSourceUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.protocol = 'https:';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|ref$|referrer$|source$|campaign$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export function primaryDocumentFetchUrl(value) {
  const canonicalUrl = canonicalSourceUrl(value);
  if (!canonicalUrl) return null;
  const url = new URL(canonicalUrl);
  const federalRegister = url.pathname.match(/^\/documents\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//);
  if (hostMatches(url.hostname.replace(/^www\./, ''), 'federalregister.gov') && federalRegister) {
    return `https://www.federalregister.gov/api/v1/documents/${federalRegister[1]}.json`;
  }
  const clinicalTrial = url.pathname.match(/^\/study\/(NCT\d+)$/i);
  if (hostMatches(url.hostname.replace(/^www\./, ''), 'clinicaltrials.gov') && clinicalTrial) {
    return `https://clinicaltrials.gov/api/v2/studies/${clinicalTrial[1].toUpperCase()}`;
  }
  return canonicalUrl;
}

const PEPTIDE_TERMS = /\b(?:peptides?|polypeptides?|GLP-?1|glucagon-like peptide|semaglutide|tirzepatide|retatrutide|liraglutide|cagrilintide|BPC-?157|TB-?500|CJC-?1295|ipamorelin|sermorelin|tesamorelin|setmelanotide|exenatide|dulaglutide|lixisenatide|octreotide|lanreotide|leuprolide|goserelin|insulin|glucagon|amylin)\b/gi;

function matchCount(value) {
  return [...String(value || '').matchAll(PEPTIDE_TERMS)].length;
}

export function peptideRelevanceScore(story) {
  const titleMatches = matchCount(story?.title);
  const urlMatches = matchCount(String(story?.url || '').replace(/[-_/]+/g, ' '));
  const highlightMatches = matchCount(Array.isArray(story?.highlights) ? story.highlights.join(' ') : story?.highlights);
  const textMatches = matchCount(String(story?.text || '').slice(0, 3000));
  if (titleMatches === 0 && urlMatches === 0 && highlightMatches < 2 && textMatches < 3) return 0;
  return titleMatches * 10 + urlMatches * 8 + Math.min(highlightMatches, 5) * 2 + Math.min(textMatches, 5);
}

export function isUsablePrimaryText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length < 500) return false;
  if (/request access due to aggressive automated scraping|complete the captcha|access denied|enable javascript and cookies to continue/i.test(text)) return false;
  return matchCount(text) > 0;
}

function isoDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(`${text} UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

export function sourcePublishedDateFromText(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const patterns = [
    /"publication_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/i,
    /\bPublished\s*:?\s*(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})\b/,
    /\bPublished\s*:?\s*([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b/,
    /\b([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s*;/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const parsed = isoDate(match?.[1]);
    if (parsed) return parsed;
  }
  return isoDate(String(fallback || '').slice(0, 10));
}

export function requiredCollectionForStory(story, profile = primarySourceProfile(story?.url)) {
  if (!profile.primary) return null;
  if (!profile.collections.includes('legal')) return 'news';
  if (profile.sourceClass === 'court') return 'legal';

  const url = String(story?.url || '');
  if (/federalregister\.gov|regulations\.gov/i.test(url)) return 'legal';

  const context = `${story?.title || ''} ${url.replace(/[-_/]+/g, ' ')}`;
  if (/\b(?:settlement|settles|indictment|indicted|charged|charges|lawsuit|court|judgment|consent decree|enforcement|false claims|warning letter|import alert|final rule|proposed rule|regulation|regulatory guidance|statute|legislation)\b/i.test(context)) {
    return 'legal';
  }
  return 'news';
}

export function primarySourceProfile(value) {
  const canonicalUrl = canonicalSourceUrl(value);
  if (!canonicalUrl) return { authoritative: false, primary: false, collections: [], reason: 'invalid URL' };

  const url = new URL(canonicalUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const specific = isSpecificSourceUrl(new URL(canonicalUrl.replace(url.hostname, host)));

  if (hostMatches(host, 'courtlistener.com')) {
    return { authoritative: true, primary: specific, sourceClass: 'court', collections: ['news', 'legal'], canonicalUrl, host };
  }
  if (INTERNATIONAL_REGULATOR_HOSTS.some((allowed) => hostMatches(host, allowed))) {
    return { authoritative: true, primary: specific, sourceClass: 'international-regulator', collections: ['news', 'legal'], canonicalUrl, host };
  }
  if (hostMatches(host, 'clinicaltrials.gov')) {
    return { authoritative: true, primary: specific, sourceClass: 'trial-registry', collections: ['news'], canonicalUrl, host };
  }
  if (RESEARCH_HOSTS.some((allowed) => hostMatches(host, allowed)) || isAcademicHost(host)) {
    return { authoritative: true, primary: specific, sourceClass: 'research', collections: ['news'], canonicalUrl, host };
  }
  if (isGovernmentHost(host)) {
    return { authoritative: true, primary: specific, sourceClass: 'government', collections: ['news', 'legal'], canonicalUrl, host };
  }
  if (COMPANY_HOSTS.some((allowed) => hostMatches(host, allowed))) {
    return { authoritative: true, primary: specific, sourceClass: 'company', collections: ['news'], canonicalUrl, host };
  }
  return { authoritative: false, primary: false, collections: [], canonicalUrl, host, reason: 'host is not an approved primary-source publisher' };
}

export function isAuthoritativeSourceUrl(value) {
  return primarySourceProfile(value).authoritative;
}

export function isEligiblePrimarySource(value, collection) {
  const profile = primarySourceProfile(value);
  return profile.primary && profile.collections.includes(collection);
}

export const NEWS_DISCOVERY_LANES = Object.freeze([
  {
    id: 'us-regulation-safety',
    preferredCollection: 'legal',
    lookbackDays: 21,
    query: 'peptide GLP-1 semaglutide tirzepatide retatrutide compounding approval warning recall guidance regulation',
    includeDomains: ['fda.gov', 'federalregister.gov', 'regulations.gov'],
  },
  {
    id: 'us-enforcement-courts',
    preferredCollection: 'legal',
    lookbackDays: 45,
    query: 'peptide GLP-1 compounded drug pharmacy enforcement indictment settlement warning letter court filing',
    includeDomains: ['justice.gov', 'ftc.gov', 'oig.hhs.gov', 'fda.gov', 'courtlistener.com'],
  },
  {
    id: 'clinical-research',
    preferredCollection: 'news',
    lookbackDays: 21,
    query: 'peptide GLP-1 semaglutide tirzepatide retatrutide clinical trial results safety phase 1 phase 2 phase 3',
    includeDomains: ['clinicaltrials.gov', 'pubmed.ncbi.nlm.nih.gov', 'jamanetwork.com', 'nejm.org', 'thelancet.com', 'nature.com', 'bmj.com'],
  },
  {
    id: 'international-regulators',
    preferredCollection: 'legal',
    lookbackDays: 30,
    query: 'peptide GLP-1 semaglutide tirzepatide compounding safety authorization regulation enforcement',
    includeDomains: ['ema.europa.eu', 'gov.uk', 'canada.ca', 'tga.gov.au', 'who.int', 'ec.europa.eu'],
  },
  {
    id: 'official-industry-disclosures',
    preferredCollection: 'news',
    lookbackDays: 14,
    query: 'peptide GLP-1 clinical trial result regulatory submission approval safety update',
    includeDomains: COMPANY_HOSTS,
  },
]);

export const PRIMARY_SOURCE_CLASSES = Object.freeze([
  'government',
  'international-regulator',
  'court',
  'trial-registry',
  'research',
  'company',
]);
