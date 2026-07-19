import { basename, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

export const WORD_LIMITS = {
  clinics: [200, 900],
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

function countMatches(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...String(text || '').matchAll(new RegExp(pattern.source, flags))].length;
}

export function writingPatternErrors(body) {
  const errors = [];
  const text = String(body || '');

  const artifactPatterns = [
    /\b(?:contentReference|oai_citation|oaicite|attributableIndex)\b/i,
    /\bturn\d+(?:search|image|news|file)\d+\b/i,
    /\[(?:cite:\s*\d|span_\d+|start_span|end_span)/i,
    /\b(?:grok_card|grok_render_citation_card_json)\b/i,
    /:::writing\b/i,
  ];
  if (artifactPatterns.some((pattern) => pattern.test(text))) {
    errors.push('Contains copied AI interface or citation artifacts');
  }

  const placeholderPatterns = [
    /\b(?:INSERT_SOURCE_URL|SOURCE_PUBLISHER|PASTE_[A-Z0-9_]+)\b/i,
    /\[(?:your name|insert[^\]]*|describe[^\]]*|link to[^\]]*)\]/i,
    /\b20\d{2}-(?:XX|xx)-(?:XX|xx)\b/,
  ];
  if (placeholderPatterns.some((pattern) => pattern.test(text))) {
    errors.push('Contains unfinished placeholder text');
  }

  if (/[?&](?:utm_source=(?:chatgpt(?:\.com)?|openai|copilot(?:\.com)?)|referrer=grok\.com)\b/i.test(text)) {
    errors.push('Contains AI-tool tracking parameters in a source URL');
  }

  const assistantChatter = [
    /\bI hope this helps\b/i,
    /\b(?:Of course|Certainly)!/i,
    /\bWould you like\b/i,
    /\b(?:please )?let me know\b/i,
    /\bhere(?:'s| is) (?:a|the) (?:template|breakdown)\b/i,
    /\bin this section,? we will\b/i,
    /\bcopy and paste (?:this|the following)\b/i,
  ];
  if (assistantChatter.some((pattern) => pattern.test(text))) {
    errors.push('Contains chatbot-to-user or template language');
  }

  const hardFormulaic = [
    /\bstands? as (?:a|an) testament\b/i,
    /\bin today['\u2019]?s (?:world|landscape)\b/i,
    /\bit is (?:important|crucial|critical) to (?:note|remember|consider)\b/i,
    /\bnot only\b[^.!?\n]{0,120}\bbut also\b/i,
    /\bnot just\b[^.!?\n]{0,120}\bbut\b/i,
    /\bwhether you(?:'re| are)\b/i,
    /^(?:#{2,6}\s*)?(?:in summary|in conclusion|key takeaways?|final thoughts)\s*$/im,
  ];
  if (hardFormulaic.some((pattern) => pattern.test(text))) {
    errors.push('Contains a strong formulaic AI-writing construction');
  }

  const softFormulaic = [
    /\b(?:delve|tapestry|interplay|pivotal|robust|seamless)\b/i,
    /\b(?:underscore|showcase|foster|enhance)(?:s|d|ing)?\b/i,
    /\bvaluable insights?\b/i,
    /\b(?:broader|evolving) landscape\b/i,
    /\b(?:serves|stands|functions|operates) as\b/i,
    /\b(?:marking|representing) (?:a|an) (?:significant|pivotal|key)\b/i,
    /\b(?:Additionally|Moreover|Furthermore|Notably),/i,
  ];
  const formulaicDensity = softFormulaic.reduce((total, pattern) => total + countMatches(text, pattern), 0);
  if (formulaicDensity >= 3) errors.push('Contains a high density of formulaic AI vocabulary');

  const vagueAttribution = /\b(?:experts|observers|some critics|industry reports|several sources|many people|researchers)\s+(?:say|argue|believe|suggest|note|claim|have cited)\b/i;
  if (vagueAttribution.test(text)) errors.push('Contains vague attribution; name the exact source');

  if (/^(?:---|\*\*\*|___)\s*\r?\n\s*#{2,6}\s/m.test(text)) {
    errors.push('Contains a decorative thematic break before a heading');
  }
  if (/^(?:#{1,6}|[-*+])\s*[\p{Extended_Pictographic}]/mu.test(text)) {
    errors.push('Contains emoji used as structural formatting');
  }

  const boldCount = countMatches(text, /\*\*[^*\n]+\*\*/);
  if (boldCount > 6) errors.push('Contains excessive boldface emphasis');
  const inlineHeaderBullets = countMatches(text, /^\s*[-*+]\s+\*\*[^*\n]+\*\*:\s+/m);
  if (inlineHeaderBullets >= 2) errors.push('Contains repeated bold-label bullet formatting');

  const headingLevels = [...text.matchAll(/^(#{2,6})\s+\S/gm)].map((match) => match[1].length);
  if (headingLevels[0] > 2 || headingLevels.some((level, index) => index > 0 && level > headingLevels[index - 1] + 1)) {
    errors.push('Contains skipped Markdown heading levels');
  }

  const paragraphOpenings = new Map();
  for (const paragraph of text.split(/\r?\n\s*\r?\n/)) {
    const prose = paragraph.replace(/^#{1,6}\s+|^[-*+]\s+/gm, '').replace(/[*_`[\]()]/g, '').trim();
    if (prose.split(/\s+/).length < 8) continue;
    const opening = (prose.toLowerCase().match(/^[a-z0-9'-]+\s+[a-z0-9'-]+/) || [])[0];
    if (opening) paragraphOpenings.set(opening, (paragraphOpenings.get(opening) || 0) + 1);
  }
  if ([...paragraphOpenings.values()].some((count) => count >= 4)) {
    errors.push('Contains a repeated paragraph-opening template');
  }

  return errors;
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

  const prohibitedClaim = /\b(peptides?|semaglutide|tirzepatide|BPC-157|thymosin)\b[^.!?\n]{0,100}\b(cures?|heals?|fixes?|reverses?|prevents?)\b/i;
  const unsupportedOutcome = /\b(significant benefits|successful therapy|effectiveness of your treatment|enhance immune function|support tissue repair)\b/i;
  if (prohibitedClaim.test(body)) errors.push('Contains a prohibited treatment claim');
  if (unsupportedOutcome.test(body)) errors.push('Contains an unsupported outcome or efficacy statement');
  if (/\b(?:buy|shop|order) research chemicals?\b/i.test(text)) errors.push('Contains research-chemical vendor language');
  if (/\u2014/.test(body)) errors.push('Contains an em dash; rewrite the sentence before publication');
  errors.push(...writingPatternErrors(body));
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
