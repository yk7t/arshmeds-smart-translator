export const STORAGE_KEY = 'smartVocabulary.v2';
export const BACKUP_KEY = 'smartVocabulary.legacyBackup';
const LEGACY_VOCABULARY_KEY = 'savedVocabulary';
const LEGACY_WORDS_KEY = 'savedEnglishWords';

export function normalizeWord(word) {
  return String(word || '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function stripMarkup(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function createRecord(data, { now, uuid }) {
  const timestamp = now();
  const word = stripMarkup(data.word);
  return {
    id: data.id || uuid(),
    word,
    normalizedWord: normalizeWord(word),
    translation: stripMarkup(data.translation) || 'تم حفظها مسبقًا',
    sentence: stripMarkup(data.sentence) || 'Saved from a previous version.',
    sentenceAr: stripMarkup(data.sentenceAr),
    status: data.status === 'mastered' || data.hidden === true ? 'mastered' : 'learning',
    correctCount: Number.isInteger(data.correctCount) && data.correctCount >= 0 ? data.correctCount : 0,
    wrongCount: Number.isInteger(data.wrongCount) && data.wrongCount >= 0 ? data.wrongCount : 0,
    reviewCount: Number.isInteger(data.reviewCount) && data.reviewCount >= 0 ? data.reviewCount : 0,
    createdAt: data.createdAt || timestamp,
    updatedAt: data.updatedAt || timestamp,
    lastReviewedAt: data.lastReviewedAt || null,
    lastUsedAt: data.lastUsedAt || timestamp
  };
}

export function createVocabularyStore(storage = window.localStorage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const uuid = options.uuid || (() => globalThis.crypto?.randomUUID?.() || `word-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function write(records) {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function migrate() {
    const current = safeParse(storage.getItem(STORAGE_KEY), null);
    if (Array.isArray(current)) {
      const normalized = current.map((item) => createRecord(item, { now, uuid })).filter((item) => item.normalizedWord);
      write(deduplicate(normalized));
      return deduplicate(normalized);
    }

    const rawVocabulary = storage.getItem(LEGACY_VOCABULARY_KEY);
    const rawWords = storage.getItem(LEGACY_WORDS_KEY);
    if ((rawVocabulary !== null || rawWords !== null) && storage.getItem(BACKUP_KEY) === null) {
      storage.setItem(BACKUP_KEY, JSON.stringify({
        createdAt: now(),
        savedVocabulary: rawVocabulary,
        savedEnglishWords: rawWords
      }));
    }

    const legacyVocabulary = safeParse(rawVocabulary, []);
    const legacyWords = safeParse(rawWords, []);
    const records = [];
    if (Array.isArray(legacyVocabulary)) {
      for (const item of legacyVocabulary) {
        if (item && typeof item === 'object') records.push(createRecord(item, { now, uuid }));
      }
    }
    if (Array.isArray(legacyWords)) {
      for (const word of legacyWords) {
        if (typeof word === 'string') records.push(createRecord({ word }, { now, uuid }));
      }
    }
    const migrated = deduplicate(records.filter((item) => item.normalizedWord));
    write(migrated);
    return migrated;
  }

  function deduplicate(records) {
    const byWord = new Map();
    for (const record of records) {
      const existing = byWord.get(record.normalizedWord);
      if (!existing) {
        byWord.set(record.normalizedWord, record);
      } else {
        const recordIsLegacyPlaceholder = record.sentence === 'Saved from a previous version.';
        byWord.set(record.normalizedWord, {
          ...existing,
          ...record,
          id: existing.id,
          createdAt: existing.createdAt,
          translation: recordIsLegacyPlaceholder ? existing.translation : record.translation,
          sentence: recordIsLegacyPlaceholder ? existing.sentence : record.sentence,
          sentenceAr: recordIsLegacyPlaceholder ? existing.sentenceAr : record.sentenceAr,
          status: existing.status === 'mastered' || record.status === 'mastered' ? 'mastered' : 'learning',
          correctCount: Math.max(existing.correctCount, record.correctCount),
          wrongCount: Math.max(existing.wrongCount, record.wrongCount)
        });
      }
    }
    return [...byWord.values()];
  }

  function getAll() {
    return migrate();
  }

  function saveTranslation(data) {
    const records = getAll();
    const normalized = normalizeWord(data.word);
    const index = records.findIndex((item) => item.normalizedWord === normalized);
    const timestamp = now();
    if (index >= 0) {
      records[index] = {
        ...records[index],
        word: stripMarkup(data.word),
        translation: stripMarkup(data.translation),
        sentence: stripMarkup(data.sentence),
        sentenceAr: stripMarkup(data.sentenceAr),
        reviewCount: records[index].reviewCount + 1,
        updatedAt: timestamp,
        lastUsedAt: timestamp
      };
      write(records);
      return records[index];
    }
    const record = createRecord({ ...data, status: 'learning' }, { now, uuid });
    records.push(record);
    write(records);
    return record;
  }

  function setStatus(id, status) {
    if (!['learning', 'mastered'].includes(status)) return null;
    const records = getAll();
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) return null;
    records[index] = { ...records[index], status, updatedAt: now() };
    write(records);
    return records[index];
  }

  function recordReview(id, isCorrect) {
    const records = getAll();
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) return null;
    records[index] = {
      ...records[index],
      correctCount: records[index].correctCount + (isCorrect ? 1 : 0),
      wrongCount: records[index].wrongCount + (isCorrect ? 0 : 1),
      lastReviewedAt: now(),
      updatedAt: now()
    };
    write(records);
    return records[index];
  }

  return {
    migrate,
    getAll,
    getLearning: () => getAll().filter((item) => item.status === 'learning'),
    getMastered: () => getAll().filter((item) => item.status === 'mastered'),
    getContextWords: (limit = 20) => getAll()
      .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
      .slice(0, limit)
      .map((item) => item.word),
    saveTranslation,
    markMastered: (id) => setStatus(id, 'mastered'),
    restoreLearning: (id) => setStatus(id, 'learning'),
    recordReview
  };
}
