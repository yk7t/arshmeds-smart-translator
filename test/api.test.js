import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { createApp } from '../server/app.js';
import { createAuthService } from '../server/auth.js';
import { withServer } from './helpers.js';

const loginEmail = 'owner@example.com';
const loginPassword = 'secure-test-password';
const passwordHash = bcrypt.hashSync(loginPassword, 4);

function fakeClient(overrides = {}) {
  return {
    configured: true,
    translate: async ({ word }) => word === 'فرصة'
      ? { word: 'opportunity', translation: 'فرصة', sentence: 'This is a good opportunity.', sentenceAr: 'هذه فرصة جيدة.' }
      : { word: 'book', translation: 'كتاب', sentence: 'I read a book.', sentenceAr: 'أنا أقرأ كتابًا.' },
    chat: async () => ({ reply: 'Hello!' }),
    ...overrides
  };
}

function testAuth(overrides = {}) {
  return createAuthService({
    email: loginEmail,
    passwordHash,
    sessionSecret: 'a'.repeat(48),
    ...overrides
  });
}

function testApp({ aiClient = fakeClient(), authService = testAuth(), ...options } = {}) {
  return createApp({ aiClient, authService, ...options });
}

async function post(baseUrl, path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

async function login(baseUrl, email = loginEmail, password = loginPassword) {
  const response = await post(baseUrl, '/auth/login', { email, password });
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie');
  return { response, payload, cookie: setCookie?.split(';')[0] };
}

function authHeaders(session) {
  return { cookie: session.cookie, 'x-csrf-token': session.payload.csrfToken };
}

test('health response reveals configuration status but no secrets', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', aiConfigured: true, authConfigured: true });
  });
});

test('login creates a protected HttpOnly session and status returns a CSRF token', async () => {
  await withServer(testApp({ production: true }), async (baseUrl) => {
    const session = await login(baseUrl);
    assert.equal(session.response.status, 200);
    const setCookie = session.response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.ok(session.payload.csrfToken);
    const status = await fetch(`${baseUrl}/auth/status`, { headers: { cookie: session.cookie } });
    assert.equal((await status.json()).authenticated, true);
  });
});

test('login rejects wrong credentials with a generic message', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const result = await login(baseUrl, loginEmail, 'wrong-password');
    assert.equal(result.response.status, 401);
    assert.equal(result.payload.error, 'INVALID_CREDENTIALS');
    assert.doesNotMatch(result.payload.message, /email|passwordHash|owner@example/i);
  });
});

test('protected APIs reject missing sessions and missing CSRF tokens', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const withoutSession = await post(baseUrl, '/api/translate', { word: 'book', contextWords: [] });
    assert.equal(withoutSession.status, 401);
    const session = await login(baseUrl);
    const withoutCsrf = await post(baseUrl, '/api/translate', { word: 'book', contextWords: [] }, { cookie: session.cookie });
    assert.equal(withoutCsrf.status, 403);
  });
});

test('translates Arabic and English inputs after authentication', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const session = await login(baseUrl);
    const arabic = await post(baseUrl, '/api/translate', { word: 'فرصة', contextWords: [] }, authHeaders(session));
    assert.equal(arabic.status, 200);
    assert.equal((await arabic.json()).word, 'opportunity');
    const english = await post(baseUrl, '/api/translate', { word: 'book', contextWords: ['school'] }, authHeaders(session));
    assert.equal(english.status, 200);
    assert.deepEqual(Object.keys(await english.json()), ['word', 'translation', 'sentence', 'sentenceAr']);
  });
});

test('rejects empty, excessively long, HTML, and non-JSON input', async () => {
  await withServer(testApp(), async (baseUrl) => {
    const session = await login(baseUrl);
    for (const word of ['', 'x'.repeat(81), '<img src=x onerror=alert(1)>']) {
      const response = await post(baseUrl, '/api/translate', { word, contextWords: [] }, authHeaders(session));
      assert.equal(response.status, 400);
    }
    const wrongType = await fetch(`${baseUrl}/api/translate`, {
      method: 'POST',
      headers: { ...authHeaders(session), 'content-type': 'text/plain' },
      body: 'word=book'
    });
    assert.equal(wrongType.status, 415);
  });
});

test('rejects foreign origins before authentication', async () => {
  await withServer(testApp({ allowedOrigins: ['https://translator.example'] }), async (baseUrl) => {
    const response = await post(baseUrl, '/api/translate', { word: 'book', contextWords: [] }, { origin: 'https://attacker.example' });
    assert.equal(response.status, 403);
  });
});

test('provider failures return a safe generic error', async () => {
  const aiClient = fakeClient({ translate: async () => { throw new Error('sensitive provider diagnostic'); } });
  await withServer(testApp({ aiClient }), async (baseUrl) => {
    const session = await login(baseUrl);
    const response = await post(baseUrl, '/api/translate', { word: 'book', contextWords: [] }, authHeaders(session));
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.error, 'AI_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(payload), /sensitive provider diagnostic/);
  });
});

test('frontend contains no secrets, inline handlers, or dynamic HTML sinks', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = ['public/index.html', 'public/js/app.js', 'public/js/storage.js'];
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /GEMINI_API_KEY|generativelanguage\.googleapis\.com|x-goog-api-key/);
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});
