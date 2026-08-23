import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGameDeck, createAnswerGuard, createCountdown, REVIEW_SECONDS } from '../public/js/game.js';

test('game deck includes learning words only without duplicates', () => {
  const records = [
    { id: '1', status: 'learning' },
    { id: '2', status: 'mastered' },
    { id: '3', status: 'learning' }
  ];
  const deck = buildGameDeck(records, () => 0);
  assert.deepEqual(new Set(deck.map((item) => item.id)), new Set(['1', '3']));
  assert.equal(deck.length, 2);
});

test('countdown flips only after exactly five one-second ticks', () => {
  assert.equal(REVIEW_SECONDS, 5);
  let callback;
  let elapsed = 0;
  const ticks = [];
  const scheduler = {
    setInterval: (fn, delay) => { callback = fn; assert.equal(delay, 1000); return 7; },
    clearInterval: () => {}
  };
  createCountdown({ onTick: (value) => ticks.push(value), onElapsed: () => { elapsed += 1; }, scheduler });
  for (let index = 0; index < 4; index += 1) callback();
  assert.equal(elapsed, 0);
  callback();
  assert.equal(elapsed, 1);
  assert.deepEqual(ticks, [5, 4, 3, 2, 1, 0]);
});

test('answer guard records a card answer only once', () => {
  const answers = [];
  const answer = createAnswerGuard((value) => answers.push(value));
  assert.equal(answer(true), true);
  assert.equal(answer(false), false);
  assert.deepEqual(answers, [true]);
});
