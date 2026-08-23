import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKUP_KEY, createVocabularyStore, STORAGE_KEY } from '../public/js/storage.js';
import { MemoryStorage } from './helpers.js';

const fixedOptions = {
  now: () => '2026-08-24T00:00:00.000Z',
  uuid: (() => { let index = 0; return () => `id-${++index}`; })()
};

test('migrates legacy vocabulary, strips stored markup, and creates a backup', () => {
  const storage = new MemoryStorage({
    savedVocabulary: JSON.stringify([
      { word: 'Book', translation: 'كتاب', sentence: "I read a <mark class='new-word'>book</mark>.", hidden: false },
      { word: 'Ready', translation: 'جاهز', sentence: 'I am ready.', hidden: true }
    ]),
    savedEnglishWords: JSON.stringify(['BOOK', 'School'])
  });
  const store = createVocabularyStore(storage, fixedOptions);
  const records = store.migrate();
  assert.equal(records.length, 3);
  assert.equal(records.find((item) => item.normalizedWord === 'book').sentence, 'I read a book.');
  assert.equal(records.find((item) => item.normalizedWord === 'ready').status, 'mastered');
  assert.ok(storage.getItem(BACKUP_KEY));
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('prevents duplicate words and updates the existing record', () => {
  const storage = new MemoryStorage();
  const store = createVocabularyStore(storage, fixedOptions);
  const first = store.saveTranslation({ word: 'Example', translation: 'مثال', sentence: 'This is an example.', sentenceAr: 'هذا مثال.' });
  const second = store.saveTranslation({ word: '  EXAMPLE  ', translation: 'نموذج', sentence: 'It is an example.', sentenceAr: 'إنه مثال.' });
  assert.equal(store.getAll().length, 1);
  assert.equal(first.id, second.id);
  assert.equal(second.reviewCount, 1);
  assert.equal(second.sentence, 'It is an example.');
});

test('mastering a word hides but does not delete it and context still includes it', () => {
  const store = createVocabularyStore(new MemoryStorage(), fixedOptions);
  const record = store.saveTranslation({ word: 'Book', translation: 'كتاب', sentence: 'I read a book.', sentenceAr: 'أنا أقرأ كتابًا.' });
  store.markMastered(record.id);
  assert.equal(store.getLearning().length, 0);
  assert.equal(store.getMastered().length, 1);
  assert.equal(store.getAll().length, 1);
  assert.deepEqual(store.getContextWords(), ['Book']);
  store.restoreLearning(record.id);
  assert.equal(store.getLearning().length, 1);
});

test('review stats are persisted for correct and wrong answers', () => {
  const store = createVocabularyStore(new MemoryStorage(), fixedOptions);
  const record = store.saveTranslation({ word: 'Book', translation: 'كتاب', sentence: 'A book.', sentenceAr: 'كتاب.' });
  store.recordReview(record.id, true);
  const reviewed = store.recordReview(record.id, false);
  assert.equal(reviewed.correctCount, 1);
  assert.equal(reviewed.wrongCount, 1);
  assert.equal(reviewed.lastReviewedAt, fixedOptions.now());
});
