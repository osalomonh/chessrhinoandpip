// A DOM-free Presenter for tests. Not a test file itself (no *.test.ts
// suffix, so npm test does not try to run it), but imported by tests that
// need to drive the engine and observe what it asked for.

import type { TapInput } from "./classify.js";
import type { Presenter, Unsubscribe } from "./presenter.js";
import type { RandomSource } from "./random.js";
import type { Scheduler } from "./scheduler.js";

export type FakePresenter = Presenter & {
  /** Simulates a tap that lands on a square. */
  tapSquare(square: string): void;
  /** Simulates a tap anywhere, for advancing dialogue. */
  tapAnywhere(): void;

  lastPrompt(): string | undefined;
  lastSpeakerLine(): { speaker: string; text: string } | undefined;
  lastStageLine(): string | undefined;
  highlighted(): string | undefined;
  cleared(): boolean;
  celebrationMedia(): string | undefined;
  celebrationRested(): boolean;
  /** Every speaker line's text played so far, in order — for asserting
   * which lines a ladder tier actually played. */
  speakerLineHistory(): Array<{ speaker: string; text: string }>;
  /** How many times showPrompt/clearPrompt have been called — for asserting
   * the prompt is shown once per tap and cleared only on resolution. */
  promptShownCount(): number;
  promptClearedCount(): number;
};

export function createFakePresenter(): FakePresenter {
  const tapListeners = new Set<(tap: TapInput) => void>();
  const tapAnywhereListeners = new Set<() => void>();

  let prompt: string | undefined;
  let speakerLine: { speaker: string; text: string } | undefined;
  let stageLine: string | undefined;
  let highlightedSquare: string | undefined;
  let clearedFlag = false;
  let celebrationMediaUrl: string | undefined;
  let rested = false;
  let promptShown = 0;
  let promptCleared = 0;
  const history: Array<{ speaker: string; text: string }> = [];

  return {
    renderBoard() {},
    placeCharacter() {},
    setPose() {},

    showSpeakerLine(speaker: string, text: string) {
      speakerLine = { speaker, text };
      stageLine = undefined;
      history.push({ speaker, text });
    },
    showStageLine(text: string) {
      stageLine = text;
      speakerLine = undefined;
    },
    clearDialogue() {
      speakerLine = undefined;
      stageLine = undefined;
    },

    showPrompt(text: string) {
      prompt = text;
      promptShown += 1;
    },
    clearPrompt() {
      prompt = undefined;
      promptCleared += 1;
    },

    highlightSquare(square: string) {
      highlightedSquare = square;
    },

    showCelebration(mediaUrl: string) {
      celebrationMediaUrl = mediaUrl;
      rested = false;
    },
    restCelebration() {
      rested = true;
    },

    clear() {
      clearedFlag = true;
      tapListeners.clear();
      tapAnywhereListeners.clear();
    },

    onTap(cb: (tap: TapInput) => void): Unsubscribe {
      tapListeners.add(cb);
      return () => tapListeners.delete(cb);
    },
    onTapAnywhere(cb: () => void): Unsubscribe {
      tapAnywhereListeners.add(cb);
      return () => tapAnywhereListeners.delete(cb);
    },

    tapSquare(square: string) {
      for (const cb of [...tapListeners]) cb({ kind: "square", square });
    },
    tapAnywhere() {
      for (const cb of [...tapAnywhereListeners]) cb();
    },

    lastPrompt: () => prompt,
    lastSpeakerLine: () => speakerLine,
    lastStageLine: () => stageLine,
    highlighted: () => highlightedSquare,
    cleared: () => clearedFlag,
    celebrationMedia: () => celebrationMediaUrl,
    celebrationRested: () => rested,
    speakerLineHistory: () => [...history],
    promptShownCount: () => promptShown,
    promptClearedCount: () => promptCleared,
  };
}

/** A scheduler that never fires on its own — every wait in a test using this
 * is resolved only by simulating a tap. Useful for proving a wait is truly
 * stuck (e.g. abort while suspended at a prompt). */
export const neverScheduler: Scheduler = () => () => {};

/** A scheduler that fires on the microtask queue rather than a real timer,
 * so dialogue (speaker/stage/pause lines) auto-advances during a test
 * without the test needing to simulate a tap-through for every line, and
 * without ever actually waiting on wall-clock time. */
export const microtaskScheduler: Scheduler = (_ms, cb) => {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) cb();
  });
  return () => {
    cancelled = true;
  };
};

/** Waits for the microtask queue to fully drain — including microtasks
 * queued by other microtasks, however deep the cascade of auto-advancing
 * dialogue lines goes — before returning. Node/JS guarantees the microtask
 * queue empties completely before a macrotask (setImmediate) runs, so one
 * call is enough regardless of how many lines are in flight. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A random source that always returns 0. Deliberately "biased" so that a
 * test relying on it can prove the no-repeat rule is enforced by
 * pickPoolIndex's exclusion, not by accident of a well-shuffled source. */
export const alwaysZeroRandom: RandomSource = {
  nextIndex() {
    return 0;
  },
};

/** A scheduler a test controls directly: nothing fires until the test calls
 * fire(), and firing never happens as a side effect of a simulated tap. Used
 * to prove a pause line waits for real elapsed time and is not skipped by a
 * tap-anywhere. */
export function createManualScheduler(): { scheduler: Scheduler; pendingCount(): number; fire(): void } {
  const pending: Array<() => void> = [];
  const scheduler: Scheduler = (_ms, cb) => {
    pending.push(cb);
    return () => {
      const i = pending.indexOf(cb);
      if (i !== -1) pending.splice(i, 1);
    };
  };
  return {
    scheduler,
    pendingCount: () => pending.length,
    fire() {
      const cb = pending.shift();
      cb?.();
    },
  };
}
