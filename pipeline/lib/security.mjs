import { isIP } from 'node:net';

const SENSITIVE_ENV_NAMES = [
  'OPENAI_API_KEY',
  'EXA_API_KEY',
  'GEMINI_API_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64',
];

export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function validateSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    return { ok: false, error: 'SUPABASE_URL is not a valid URL' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return { ok: false, error: 'SUPABASE_URL must be a credential-free HTTPS URL without a custom port' };
  }
  if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
    return { ok: false, error: 'SUPABASE_URL must use the project subdomain on supabase.co' };
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return { ok: false, error: 'SUPABASE_URL must not include a path, query, or fragment' };
  }
  return { ok: true, url: parsed.origin };
}

export function assertSupabaseUrl(value) {
  const result = validateSupabaseUrl(value);
  if (!result.ok) throw new Error(result.error);
  return result.url;
}

export function isPublicIpAddress(address) {
  const family = isIP(address);
  if (!family) return false;
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase().split('%')[0];
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpAddress(mapped[1]);
  return !(
    normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) || /^fe[c-f]/.test(normalized) ||
    normalized.startsWith('ff') || normalized.startsWith('2001:db8:')
  );
}

export function validateOutboundUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    return { ok: false, error: 'invalid URL' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, error: 'only HTTP and HTTPS are allowed' };
  if (parsed.username || parsed.password) return { ok: false, error: 'URL credentials are not allowed' };
  if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost') || parsed.hostname.endsWith('.local') || parsed.hostname.endsWith('.internal')) {
    return { ok: false, error: 'local hostnames are not allowed' };
  }
  if (isIP(parsed.hostname) && !isPublicIpAddress(parsed.hostname)) return { ok: false, error: 'non-public IP addresses are not allowed' };
  return { ok: true, url: parsed };
}

export function redactSecrets(value) {
  let text = String(value ?? '');
  for (const name of SENSITIVE_ENV_NAMES) {
    const secret = process.env[name];
    if (secret && secret.length >= 8) text = text.split(secret).join(`[REDACTED:${name}]`);
  }
  return text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:key|api[_-]?key|token|access[_-]?token)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/\b(sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,})\b/g, '[REDACTED]');
}
