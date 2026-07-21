import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIpAddress, redactSecrets, validateOutboundUrl, validateSupabaseUrl } from '../lib/security.mjs';

test('private, loopback, link-local, metadata, and documentation IPs are rejected', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1', '2001:db8::1']) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);
});

test('outbound URL validation rejects local destinations and credentials', () => {
  for (const value of ['file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'https://user:pass@example.org/', 'http://service.internal/']) {
    assert.equal(validateOutboundUrl(value).ok, false, value);
  }
  assert.equal(validateOutboundUrl('https://www.fda.gov/drugs').ok, true);
});

test('Supabase credentials can only be sent to the official project host', () => {
  assert.equal(validateSupabaseUrl('https://sample-project.supabase.co').ok, true);
  for (const value of ['http://sample.supabase.co', 'https://evil.example', 'https://sample.supabase.co.attacker.test', 'https://sample.supabase.co/rest/v1']) {
    assert.equal(validateSupabaseUrl(value).ok, false, value);
  }
});

test('logs redact configured and recognizable secrets', () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = ['sk', 'proj', 'example', 'secret', '123456789'].join('-');
  try {
    const redacted = redactSecrets(`Authorization: Bearer abc123 https://x.test/?key=secret ${process.env.OPENAI_API_KEY}`);
    assert.equal(redacted.includes('example-secret'), false);
    assert.equal(redacted.includes('Bearer abc123'), false);
    assert.equal(redacted.includes('key=secret'), false);
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});
