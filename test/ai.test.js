import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiClient } from '../server/ai.js';

function providerResponse(value, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] };
    }
  };
}

test('provider key is sent in a server header and never in the URL', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return providerResponse({
      word: 'opportunity',
      translation: 'فرصة',
      sentence: 'This is a good opportunity.',
      sentenceAr: 'هذه فرصة جيدة.'
    });
  };
  const client = createGeminiClient({ apiKey: 'server-secret', model: 'configured-model', fetchImpl });
  const result = await client.translate({ word: 'فرصة', contextWords: ['book'] });
  assert.equal(result.word, 'opportunity');
  assert.doesNotMatch(request.url, /server-secret/);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-secret');
  assert.match(request.url, /configured-model/);
  const requestBody = JSON.parse(request.options.body);
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  assert.ok(requestBody.generationConfig.responseJsonSchema);
});

test('invalid provider JSON is retried once and then validated', async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return providerResponse({ word: 'missing-fields' });
    return providerResponse({
      word: 'book',
      translation: 'كتاب',
      sentence: 'I read a book.',
      sentenceAr: 'أنا أقرأ كتابًا.'
    });
  };
  const client = createGeminiClient({ apiKey: 'secret', model: 'model', fetchImpl });
  const result = await client.translate({ word: 'book', contextWords: [] });
  assert.equal(attempts, 2);
  assert.equal(result.translation, 'كتاب');
});

test('unconfigured client fails closed without making provider requests', async () => {
  let calls = 0;
  const client = createGeminiClient({ apiKey: '', model: '', fetchImpl: async () => { calls += 1; } });
  assert.equal(client.configured, false);
  await assert.rejects(client.translate({ word: 'book', contextWords: [] }), /not configured/);
  assert.equal(calls, 0);
});
