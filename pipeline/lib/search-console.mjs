import { createSign } from 'node:crypto';
import { loadEnv, log } from '../scripts/lib.mjs';
import { GOOGLE_OAUTH_TOKEN_URL } from './security.mjs';

loadEnv();

const DEFAULT_PROPERTIES = [
  'sc-domain:mypeptide.club',
  'sc-domain:toppeptideslist.com',
  'sc-domain:safepeptides.us',
  'sc-domain:peptidesnews.us',
  'sc-domain:peptidesupdates.com',
];
const QUERY_LIMIT_PER_PROPERTY = 250;

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64url');
}

function serviceAccount() {
  const encoded = (process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64 || '').trim();
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!parsed.client_email || !parsed.private_key) throw new Error('client_email or private_key is missing');
    if (parsed.token_uri && parsed.token_uri !== GOOGLE_OAUTH_TOKEN_URL) throw new Error(`token_uri must be ${GOOGLE_OAUTH_TOKEN_URL}`);
    return parsed;
  } catch (error) {
    throw new Error(`Invalid GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64: ${error.message}`);
  }
}

function properties() {
  const configured = (process.env.GOOGLE_SEARCH_CONSOLE_PROPERTIES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_PROPERTIES;
}

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64url(signer.sign(account.private_key))}`;

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()).access_token;
}

function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export function isConfigured() {
  return Boolean((process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64 || '').trim());
}

export async function fetchSearchQueries() {
  const account = serviceAccount();
  if (!account) {
    log('info', 'search-console: service account not configured; using the editorial seed queue');
    return [];
  }

  const token = await accessToken(account);
  const periodEnd = isoDate(3);
  const periodStart = isoDate(30);
  const checkedAt = new Date().toISOString();
  const metrics = [];

  for (const property of properties()) {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: periodStart,
          endDate: periodEnd,
          dimensions: ['query'],
          rowLimit: QUERY_LIMIT_PER_PROPERTY,
          dataState: 'final',
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Search Console ${property} ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    for (const row of data.rows || []) {
      const keyword = row.keys?.[0]?.trim().toLowerCase();
      if (!keyword) continue;
      metrics.push({
        source: 'google_search_console',
        property,
        keyword,
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number.isFinite(Number(row.position)) ? Number(row.position) : null,
        period_start: periodStart,
        period_end: periodEnd,
        checked_at: checkedAt,
        updated_at: checkedAt,
      });
    }
    log('info', `search-console: collected ${(data.rows || []).length} queries for ${property}`);
  }

  return metrics;
}
