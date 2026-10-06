import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, validSession, verifyPassword, ensureSameOrigin } from '../lib/admin-auth.ts';
test('rejects tampered and expired sessions and accepts signed sessions', async () => {
  const secret = 'a-test-secret-with-at-least-32-characters';
  const token = await signSession(secret, Date.now() + 10000);
  assert.equal(await validSession(token, secret), true);
  assert.equal(await validSession(token + 'x', secret), false);
  assert.equal(await validSession(await signSession(secret, Date.now() - 1), secret), false);
  assert.equal(await validSession(token, 'another-secret'), false);
  assert.equal(await validSession('', ''), false);
});
test('verifies PBKDF2 password hash without accepting wrong password', async () => {
  const salt = 'testsalt';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('correct-password'), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hash = Buffer.from(derived).toString('hex');
  assert.equal(await verifyPassword('correct-password', salt, hash), true);
  assert.equal(await verifyPassword('wrong-password', salt, hash), false);
});
test('rejects cross-origin mutations', () => {
  assert.doesNotThrow(() => ensureSameOrigin(new Request('https://example.com/api', { headers: { origin: 'https://example.com' } })));
  assert.throws(() => ensureSameOrigin(new Request('https://example.com/api', { headers: { origin: 'https://other.com' } })));
  assert.throws(() => ensureSameOrigin(new Request('https://example.com/api')));
});
