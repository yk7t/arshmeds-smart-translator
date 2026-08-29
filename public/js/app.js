import { buildGameDeck, createAnswerGuard, createCountdown, REVIEW_SECONDS } from './game.js';
import { createVocabularyStore } from './storage.js';

const store = createVocabularyStore();
store.migrate();

const elements = Object.fromEntries([
  'authLoading', 'loginPage', 'authForm', 'authEmail', 'authPassword', 'authButton', 'loginStatus', 'authSubtitle', 'toggleAuthModeBtn',
  'appShell', 'logoutButton',
  'themeToggle', 'homeLearningCount', 'homeMasteredCount', 'translationForm', 'wordInput',
  'translateButton', 'translationStatus', 'translationResult', 'resultWord', 'resultTranslation',
  'resultSentence', 'resultSentenceAr', 'speakWordButton', 'speakSentenceButton', 'chatForm',
  'chatInput', 'chatButton', 'chatMessages', 'learningCount', 'masteredCount', 'dictionaryList',
  'dictionaryEmpty', 'toggleMasteredButton', 'masteredSection', 'masteredList', 'undoToast',
  'undoButton', 'gameAudio', 'gameIntro', 'gameBoard', 'gameEnd', 'startGameButton',
  'restartGameButton', 'gameIntroMessage', 'timerDisplay', 'scoreDisplay', 'flashcard',
  'cardWord', 'cardSentence', 'cardTranslation', 'cardSentenceAr', 'answerControls',
  'knownButton', 'unknownButton', 'finalScore'
].map((id) => [id, document.getElementById(id)]));

let lastResult = null;
let csrfToken = null;
let undoRecordId = null;
let undoTimer = null;
let gameDeck = [];
let gameIndex = 0;
let score = 0;
let cancelCountdown = null;
let answerCurrentCard = null;
let isRegisterMode = false;

function setTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  elements.themeToggle.textContent = dark ? '☀️' : '🌙';
  elements.themeToggle.setAttribute('aria-label', dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

setTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
elements.themeToggle.addEventListener('click', () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));

function showLogin(message = '') {
  csrfToken = null;
  elements.authLoading.hidden = true;
  elements.appShell.hidden = true;
  elements.loginPage.hidden = false;
  elements.loginStatus.textContent = message;
  elements.authPassword.value = '';
  elements.authEmail.focus();
}

async function showAuthenticatedApp(token) {
  csrfToken = token;
  store.setToken(token);
  elements.loginPage.hidden = true;
  elements.authLoading.hidden = false;
  elements.loginStatus.textContent = '';
  
  await store.syncDown();
  
  elements.authLoading.hidden = true;
  elements.appShell.hidden = false;
  updateStats();
  renderDictionary();
}

elements.toggleAuthModeBtn.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  elements.authButton.textContent = isRegisterMode ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
  elements.authSubtitle.textContent = isRegisterMode ? 'أدخل بريداً وكلمة مرور لإنشاء حسابك الخاص.' : 'سجّل الدخول للوصول إلى قاموسك وتدريباتك.';
  elements.toggleAuthModeBtn.textContent = isRegisterMode ? 'لديك حساب بالفعل؟ سجل الدخول' : 'ليس لديك حساب؟ أنشئ حساباً جديداً';
  elements.loginStatus.textContent = '';
});

async function checkAuthentication() {
  try {
    const response = await fetch('/auth/status', { headers: { accept: 'application/json' } });
    const data = await response.json();
    if (!data.configured) {
      showLogin('بيانات الدخول غير مجهزة في الخادم.');
      return;
    }
    if (data.authenticated && data.csrfToken) {
      showAuthenticatedApp(data.csrfToken);
      return;
    }
    showLogin();
  } catch {
    showLogin('تعذر الاتصال بالخادم. تأكد أن البرنامج يعمل ثم حاول مجددًا.');
  }
}

elements.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (elements.authButton.disabled) return;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  if (!email || !password) {
    elements.loginStatus.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.';
    return;
  }
  elements.authButton.disabled = true;
  elements.loginStatus.textContent = 'جاري المعالجة…';
  
  const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || (isRegisterMode ? 'فشل إنشاء الحساب.' : 'تعذر تسجيل الدخول.'));
    showAuthenticatedApp(data.csrfToken);
  } catch (error) {
    elements.loginStatus.textContent = error.message;
  } finally {
    elements.authButton.disabled = false;
  }
});

elements.logoutButton.addEventListener('click', async () => {
  elements.logoutButton.disabled = true;
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken || '' },
      body: '{}'
    });
  } finally {
    elements.logoutButton.disabled = false;
    stopGameMedia();
    showLogin('تم تسجيل الخروج بأمان.');
  }
});

function stopGameMedia() {
  cancelCountdown?.();
  cancelCountdown = null;
  elements.gameAudio.pause();
  elements.gameAudio.currentTime = 0;
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === pageId));
  if (pageId !== 'gamePage') stopGameMedia();
  if (pageId === 'dictionaryPage') renderDictionary();
  if (pageId === 'gamePage') resetGameView();
  updateStats();
  document.getElementById(pageId)?.querySelector('h1, h2')?.focus?.({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-page]').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});

function updateStats() {
  const learning = store.getLearning().length;
  const mastered = store.getMastered().length;
  elements.learningCount.textContent = String(learning);
  elements.masteredCount.textContent = String(mastered);
  elements.homeLearningCount.textContent = String(learning);
  elements.homeMasteredCount.textContent = String(mastered);
}

function makeButton(text, className, onClick, ariaLabel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}

function createWordCard(record, mastered = false) {
  const card = document.createElement('article');
  card.className = 'word-card';
  const header = document.createElement('div');
  header.className = 'word-card-header';
  const title = document.createElement('h3');
  title.dir = 'ltr';
  title.textContent = record.word;
const speakBtn = makeButton('🔊', 'icon-button', () => speak(record.word), `نطق كلمة ${record.word}`);
  header.append(title, speakBtn);

  const meaning = document.createElement('p');
  meaning.className = 'meaning';
  meaning.textContent = `المعنى: ${record.translation}`;
  const example = document.createElement('p');
  example.className = 'example';
  example.textContent = record.sentence;
  card.append(header, meaning, example);
  if (record.sentenceAr) {
    const exampleAr = document.createElement('p');
    exampleAr.className = 'example-ar';
    exampleAr.textContent = record.sentenceAr;
    card.append(exampleAr);
  }
  const actions = document.createElement('div');
  actions.className = 'word-actions';
  if (mastered) {
    actions.append(makeButton('إعادتها للتعلّم', 'restore-word', () => {
      store.restoreLearning(record.id);
      renderDictionary();
    }));
  } else {
    actions.append(makeButton('حفظتها / إخفاء', 'hide-word', () => hideWord(record.id)));
  }
  card.append(actions);
  return card;
}

function renderDictionary() {
  const learning = store.getLearning().slice().reverse();
  const mastered = store.getMastered().slice().reverse();
  elements.dictionaryList.replaceChildren(...learning.map((record) => createWordCard(record)));
  elements.masteredList.replaceChildren(...mastered.map((record) => createWordCard(record, true)));
  elements.dictionaryEmpty.hidden = learning.length > 0;
  elements.dictionaryList.hidden = learning.length === 0;
  updateStats();
}

function hideWord(id) {
  const record = store.markMastered(id);
  if (!record) return;
  undoRecordId = id;
  elements.undoToast.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    elements.undoToast.hidden = true;
    undoRecordId = null;
  }, 6000);
  renderDictionary();
}

elements.undoButton.addEventListener('click', () => {
  if (undoRecordId) store.restoreLearning(undoRecordId);
  undoRecordId = null;
  clearTimeout(undoTimer);
  elements.undoToast.hidden = true;
  renderDictionary();
});

elements.toggleMasteredButton.addEventListener('click', () => {
  const expanded = elements.toggleMasteredButton.getAttribute('aria-expanded') === 'true';
  elements.toggleMasteredButton.setAttribute('aria-expanded', String(!expanded));
  elements.toggleMasteredButton.textContent = expanded ? 'عرض الكلمات المتقنة' : 'إخفاء الكلمات المتقنة';
  elements.masteredSection.hidden = expanded;
});

async function apiRequest(path, payload) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken || '' },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('لا يوجد اتصال بالخادم. تحقق من الشبكة وحاول مجددًا.');
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  }
  if (!response.ok) throw new Error(data.message || 'تعذر تنفيذ الطلب حاليًا.');
  return data;
}

function appendHighlightedSentence(container, sentence, newWord, contextWords) {
  container.replaceChildren();
  const words = [newWord, ...contextWords]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!words.length) {
    container.textContent = sentence;
    return;
  }
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  let cursor = 0;
  for (const match of sentence.matchAll(regex)) {
    container.append(document.createTextNode(sentence.slice(cursor, match.index)));
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    if (match[0].toLocaleLowerCase('en-US') !== newWord.toLocaleLowerCase('en-US')) mark.className = 'old';
    container.append(mark);
    cursor = match.index + match[0].length;
  }
  container.append(document.createTextNode(sentence.slice(cursor)));
}

elements.translationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (elements.translateButton.disabled) return;
  const word = elements.wordInput.value.trim();
  if (!word) {
    elements.translationStatus.textContent = 'اكتب كلمة أولًا.';
    elements.translationStatus.classList.add('error');
    return;
  }
  const contextWords = store.getContextWords(20);
  elements.translateButton.disabled = true;
  elements.translationResult.hidden = true;
  elements.translationStatus.classList.remove('error');
  elements.translationStatus.textContent = 'جاري الترجمة وصناعة جملة مناسبة…';
  try {
    const result = await apiRequest('/api/translate', { word, contextWords });
    const saved = store.saveTranslation(result);
    lastResult = saved;
    elements.resultWord.textContent = saved.word;
    elements.resultTranslation.textContent = saved.translation;
    appendHighlightedSentence(elements.resultSentence, saved.sentence, saved.word, contextWords);
    elements.resultSentenceAr.textContent = saved.sentenceAr;
    elements.translationResult.hidden = false;
    elements.translationStatus.textContent = 'تمت الترجمة وحفظ الكلمة في قاموسك.';
    elements.wordInput.value = '';
    updateStats();
  } catch (error) {
    elements.translationStatus.classList.add('error');
    elements.translationStatus.textContent = error.message;
  } finally {
    elements.translateButton.disabled = false;
  }
});

function speak(text) {
  if (!('speechSynthesis' in window) || !text) {
    elements.translationStatus.classList.add('error');
    elements.translationStatus.textContent = 'النطق غير مدعوم في هذا المتصفح.';
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

elements.speakWordButton.addEventListener('click', () => speak(lastResult?.word));
elements.speakSentenceButton.addEventListener('click', () => speak(lastResult?.sentence));

function appendMessage(text, sender) {
  const message = document.createElement('p');
  message.className = `message ${sender}`;
  message.textContent = text;
  elements.chatMessages.append(message);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  return message;
}

elements.chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (elements.chatButton.disabled) return;
  const message = elements.chatInput.value.trim();
  if (!message) return;
  appendMessage(message, 'user');
  elements.chatInput.value = '';
  elements.chatButton.disabled = true;
  const pending = appendMessage('جاري التفكير…', 'assistant');
  try {
    const result = await apiRequest('/api/chat', { message });
    pending.textContent = result.reply;
  } catch (error) {
    pending.textContent = error.message;
  } finally {
    elements.chatButton.disabled = false;
  }
});

function resetGameView() {
  stopGameMedia();
  elements.gameIntro.hidden = false;
  elements.gameBoard.hidden = true;
  elements.gameEnd.hidden = true;
  elements.gameIntroMessage.textContent = '';
  elements.flashcard.classList.remove('flipped');
}

function startGame() {
  gameDeck = buildGameDeck(store.getAll());
  if (!gameDeck.length) {
    elements.gameIntroMessage.textContent = 'لا توجد كلمات قيد التعلم. ترجم كلمة جديدة أولًا.';
    return;
  }
  gameIndex = 0;
  score = 0;
  elements.gameIntro.hidden = true;
  elements.gameEnd.hidden = true;
  elements.gameBoard.hidden = false;
  elements.gameAudio.currentTime = 0;
  elements.gameAudio.play().catch(() => {});
  showCard();
}

function showCard() {
  cancelCountdown?.();
  const card = gameDeck[gameIndex];
  elements.flashcard.classList.remove('flipped');
  elements.answerControls.hidden = true;
  elements.cardWord.textContent = card.word;
  elements.cardSentence.textContent = card.sentence;
  elements.cardTranslation.textContent = card.translation;
  elements.cardSentenceAr.textContent = card.sentenceAr || '';
  elements.scoreDisplay.textContent = `النتيجة: ${score} / ${gameIndex}`;
  answerCurrentCard = createAnswerGuard((isCorrect) => {
    cancelCountdown?.();
    store.recordReview(card.id, isCorrect);
    if (isCorrect) score += 1;
    elements.knownButton.disabled = true;
    elements.unknownButton.disabled = true;
    setTimeout(() => {
      elements.knownButton.disabled = false;
      elements.unknownButton.disabled = false;
      gameIndex += 1;
      if (gameIndex >= gameDeck.length) finishGame();
      else showCard();
    }, 220);
  });
  cancelCountdown = createCountdown({
    seconds: REVIEW_SECONDS,
    onTick: (remaining) => { elements.timerDisplay.textContent = `⏱️ ${remaining}`; },
    onElapsed: () => {
      elements.flashcard.classList.add('flipped');
      elements.answerControls.hidden = false;
    }
  });
}

function finishGame() {
  stopGameMedia();
  elements.gameBoard.hidden = true;
  elements.gameEnd.hidden = false;
  elements.finalScore.textContent = `نتيجتك ${score} من ${gameDeck.length}`;
  updateStats();
}

elements.startGameButton.addEventListener('click', startGame);
elements.restartGameButton.addEventListener('click', startGame);
elements.knownButton.addEventListener('click', () => answerCurrentCard?.(true));
elements.unknownButton.addEventListener('click', () => answerCurrentCard?.(false));

window.addEventListener('pagehide', stopGameMedia);
updateStats();
checkAuthentication();
