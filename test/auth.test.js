import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { AUTH_COOKIE_NAME, createAuthService, SESSION_TTL_MS } from '../server/auth.js';

function serviceAt(now) {
  return createAuthService({
    email: 'owner@example.com',
    passwordHash: bcrypt.hashSync('secure-password-123', 4),
    sessionSecret: 's'.repeat(48),
    now: () => now.value
  });
}

test('session signatures reject tampering and expire after eight hours', () => {
  const now = { value: 1_000_000 };
  const auth = serviceAt(now);
  const token = auth.createSessionToken();
  assert.ok(auth.readSession(`${AUTH_COOKIE_NAME}=${token}`));
  assert.equal(auth.readSession(`${AUTH_COOKIE_NAME}=${token}tampered`), null);
  now.value += SESSION_TTL_MS + 1;
  assert.equal(auth.readSession(`${AUTH_COOKIE_NAME}=${token}`), null);
});

test('authentication is disabled for plaintext passwords or short session secrets', () => {
  const plaintext = createAuthService({ email: 'owner@example.com', passwordHash: 'plaintext', sessionSecret: 's'.repeat(48) });
  const shortSecret = createAuthService({ email: 'owner@example.com', passwordHash: bcrypt.hashSync('password', 4), sessionSecret: 'short' });
  assert.equal(plaintext.configured, false);
  assert.equal(shortSecret.configured, false);
});
