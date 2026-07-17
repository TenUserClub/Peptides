import { basename, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

export const WORD_LIMITS = {
  clinics: [700, 1100],
  doctors: [700, 1500],
  news: [400, 700],
  legal: [400, 700],
  blog: [1000, 1500],
  updates: [150, 800],
};

const REQUIRED = {
  clinics: ['title', 'description', 'clinicName', 'city', 'state', 'sources', 'verified', 'publishDate', 'author'],
  doctors: ['title', 'description', 'kind', 'state', 'specialty', 'sources', 'verified', 'publishDate', 'author'],
  news: ['title', 'description', 'sourceName', 'sourceUrl', 'sourceType', 'publishDate', 'author'],
  legal: ['title', 'description', 'jurisdiction', 'sourceName', 'sourceUrl', 'sourceType', 'publishDate', 'author'],
  blog: ['title', 'description', 'category', 'sources', 'publishDate', 'author'],
  updates: ['title', 'description', 'weekOf', 'publishDate', 'author'],
};

const AUTHORITATIVE_HOSTS = [
  '.gov', '.edu', 'who.int', 'clinicaltrials.gov', 'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov', 'jamanetwork.com', 'nejm.org', 'thelancet.com',
  'nature.com', 'science.org', 'bmj.com', 'courtlistener.com',
];

export function parseFrontmatter(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!field) continue;
    let value = field[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      try { value = JSON.parse(value.replace(/'/g, '"')); } catch { /* validation reports malformed arrays */ }
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = Number(value);
    }
    data[field[1]] = value;
  }
  return { data, body: match[2] };
}

export function wordCount(body) {
  return String(body || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_`>[\]()!-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function isAuthoritativeUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return AUTHORITATIVE_HOSTS.some((allowed) => host === allowed || host.endsWith(allowed));
  } catch {
    return false;
  }
}

function readVerified(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function verifiedDoctorRecords(root) {
  const dir = join(root, 'doctors');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => readVerified(join(dir, name))).filter(Boolean);
}

export function validateContent({ text, collection, filename, verifiedRoot }) {
  const errors = [];
  const parsed = parseFrontmatter(text);
  if (!parsed) return { ok: false, errors: ['Frontmatter is missing or malformed'], data: null, words: 0 };
  const { data, body } = parsed;

  if (!REQUIRED[collection]) errors.push(`Unknown collection: ${collection}`);
  for (const field of REQUIRED[collection] || []) {
    const value = data[field];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (basename(filename).startsWith('_')) errors.push('Underscore-prefixed sample or internal files cannot be published');
  if (data.verified !== undefined && data.verified !== true) errors.push('verified must be true');

  const words = wordCount(body);
  const limits = WORD_LIMITS[collection];
  if (limits && (words < limits[0] || words > limits[1])) {
    errors.push(`Word count ${words} is outside ${limits[0]}-${limits[1]}`);
  }

  const prohibitedClaim = /\b(peptides?|semaglutide|tirzepatide|BPC-157|thymosin)\b[^.!?\n]{0,100}\b(cures?|heals?|treats?|fixes?|reverses?|prevents?)\b/i;
  const unsupportedOutcome = /\b(significant benefits|successful therapy|effectiveness of your treatment|enhance immune function|support tissue repair)\b/i;
  if (prohibitedClaim.test(body)) errors.push('Contains a prohibited treatment claim');
  if (unsupportedOutcome.test(body)) errors.push('Contains an unsupported outcome or efficacy statement');
  if (/research chemical|for research use only|not for human consumption/i.test(text)) errors.push('Contains research-chemical vendor language');
  if (/https?:\/\/(?:www\.)?example\.com/i.test(text)) errors.push('Contains an example.com source');
  if (/https?:\/\/[^\s)"']+\.vercel\.app/i.test(text)) errors.push('Contains a legacy Vercel deployment URL');

  if ((collection === 'news' || collection === 'legal')) {
    if (data.sourceType !== 'primary') errors.push('News and legal posts require sourceType: primary');
    if (!isAuthoritativeUrl(data.sourceUrl)) errors.push('News and legal sourceUrl must be an authoritative primary source');
  }

  if (collection === 'blog') {
    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.length < 2) errors.push('Blog posts require at least two authoritative sources');
    if (sources.some((source) => !isAuthoritativeUrl(source))) errors.push('Every blog source must be authoritative');
  }

  if (collection === 'clinics' || collection === 'doctors') {
    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.some((source) => { try { return new URL(source).hostname === 'example.com'; } catch { return true; } })) {
      errors.push('Directory sources must be valid, non-example URLs');
    }
  }

  if (collection === 'clinics' && verifiedRoot) {
    const recordPath = join(verifiedRoot, 'clinics', basename(filename, '.md') + '.json');
    const record = readVerified(recordPath);
    if (!record?.verified) errors.push('No matching verified clinic record');
  }

  if (collection === 'doctors' && verifiedRoot) {
    if (data.kind === 'profile') {
      const recordPath = join(verifiedRoot, 'doctors', basename(filename, '.md') + '.json');
      const record = readVerified(recordPath);
      if (!record?.verified || !record?.npi || record.npi !== data.npi) errors.push('No matching NPI-verified doctor record');
    } else if (data.kind === 'roundup') {
      if (!data.methodology) errors.push('Doctor roundups require methodology');
      const matching = verifiedDoctorRecords(verifiedRoot).filter((record) => record.verified && record.npi && record.state === data.state && record.specialty === data.specialty);
      if (matching.length < 5) errors.push('Doctor roundups require at least five matching NPI-verified records');
    }
  }

  if ((collection === 'blog' || collection === 'news' || collection === 'legal' || collection === 'updates') && /\]\(\/clinics\//.test(body)) {
    errors.push('Content hub posts must use the full clinics domain for cross-site links');
  }
  if (collection !== 'doctors' && /\]\(\/doctors\//.test(body)) {
    errors.push('Cross-site doctor links must use the full doctors domain');
  }
  if (/https:\/\/mypeptide\.club\/doctors\//i.test(body)) errors.push('Doctor links must use toppeptideslist.com');
  if (/https:\/\/safepeptides\.us\/news\//i.test(body)) errors.push('News links must use peptidesnews.us');
  if (/https:\/\/safepeptides\.us\/updates\//i.test(body)) errors.push('Update links must use peptidesupdates.com');
  if (/https:\/\/peptidesnews\.us\/news\//i.test(body)) errors.push('News links must use the peptidesnews.us root path');
  if (/https:\/\/peptidesupdates\.com\/updates\//i.test(body)) errors.push('Update links must use the peptidesupdates.com root path');

  return { ok: errors.length === 0, errors, data, words };
}
