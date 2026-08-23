export const REVIEW_SECONDS = 5;

export function buildGameDeck(records, random = Math.random) {
  const deck = records.filter((item) => item.status === 'learning').slice();
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function createCountdown({ seconds = REVIEW_SECONDS, onTick, onElapsed, scheduler = globalThis }) {
  let remaining = seconds;
  let finished = false;
  onTick(remaining);
  const intervalId = scheduler.setInterval(() => {
    if (finished) return;
    remaining -= 1;
    onTick(remaining);
    if (remaining <= 0) {
      finished = true;
      scheduler.clearInterval(intervalId);
      onElapsed();
    }
  }, 1000);
  return () => {
    finished = true;
    scheduler.clearInterval(intervalId);
  };
}

export function createAnswerGuard(onAnswer) {
  let answered = false;
  return (isCorrect) => {
    if (answered) return false;
    answered = true;
    onAnswer(Boolean(isCorrect));
    return true;
  };
}
