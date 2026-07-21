import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPublicIpAddress, validateOutboundUrl } from './security.mjs';

const ALLOWED_CONTENT_TYPES = [
  'text/html', 'text/plain', 'application/xhtml+xml', 'application/xml', 'text/xml', 'application/json',
];

async function vettedAddress(hostname) {
  if (isIP(hostname)) {
    if (!isPublicIpAddress(hostname)) throw new Error('Blocked non-public destination');
    return { address: hostname, family: isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error('Blocked hostname resolving to a non-public destination');
  }
  return addresses[0];
}

function requestOnce(url, { timeout, maxBytes, headers }) {
  return new Promise(async (resolve, reject) => {
    try {
      const validation = validateOutboundUrl(url);
      if (!validation.ok) throw new Error(`Blocked outbound URL: ${validation.error}`);
      const parsed = validation.url;
      const selected = await vettedAddress(parsed.hostname);
      const transport = parsed.protocol === 'https:' ? https : http;
      const request = transport.request(parsed, {
        method: 'GET',
        headers,
        lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      }, (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirect: new URL(response.headers.location, parsed).toString(), status });
          return;
        }
        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))) {
          response.resume();
          reject(new Error(`Unsupported response content type: ${contentType || 'missing'}`));
          return;
        }
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            request.destroy(new Error(`Response exceeded ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) reject(new Error(`HTTP ${status}`));
          else resolve({ body, status });
        });
      });
      request.setTimeout(timeout, () => request.destroy(new Error(`Request timed out after ${timeout}ms`)));
      request.on('error', reject);
      request.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function safeFetchText(url, options = {}) {
  const timeout = options.timeout ?? 15_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const headers = options.headers || {};
  let current = url;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const result = await requestOnce(current, { timeout, maxBytes, headers });
    if (!result.redirect) return result.body;
    if (redirects === maxRedirects) throw new Error(`Too many redirects (maximum ${maxRedirects})`);
    current = result.redirect;
  }
  throw new Error('Unable to fetch source');
}
