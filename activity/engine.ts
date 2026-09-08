// The DOM-free engine: the sequence, the tap ladder, classification, line
// sequencing and completion, exactly as contracts/activity.md describes it.
// It knows nothing about the DOM — it drives a Presenter (presenter.ts) and
// is driven, in turn, by index.ts (which supplies a real dom-presenter) or
// by a test (which supplies a fake one).

import type { Chapter, RawLine, Tap } from "./types.js";
import { parseLine } from "./chapter.js";
import { classifyTap, findRepresentativeSquare, resolveOrigin, type ClassifyContext, type TapInput } from "./classify.js";
import type { Presenter } from "./presenter.js";
import { defaultRandom, pickPoolIndex, type RandomSource } from "./random.js";
import { defaultScheduler, type Scheduler } from "./scheduler.js";

export type Engine = {
  start(): void;
  onComplete(cb: (chapterId: string) => void): void;
  abort(): void;
};

export type EngineOptions = {
  random?: RandomSource;
  scheduler?: Scheduler;
  /** How long a speaker line stays up before auto-advancing, if the child
   * does nothing. Proportional to length; never faster than a slow reader. */
  readingPauseMs?: (text: string) => number;
};

const STAGE_PAUSE_MS = 900;

function defaultReadingPause(text: string): number {
  // A slow reader's pace: a fixed thinking-time floor, plus per-character
  // time, with a hard floor so even one-word lines stay up a beat.
  return Math.max(1200, 700 + text.length * 45);
}

export function createEngine(chapter: Chapter, presenter: Presenter, options: EngineOptions = {}): Engine {
  const random = options.random ?? defaultRandom;
  const schedule = options.scheduler ?? defaultScheduler;
  const readingPause = options.readingPauseMs ?? defaultReadingPause;

  let aborted = false;
  let completeCbs: Array<(chapterId: string) => void> = [];
  let activeCancel: (() => void) | null = null;

  function onComplete(cb: (chapterId: string) => void): void {
    completeCbs.push(cb);
  }

  function emitComplete(): void {
    if (aborted) return;
    for (const cb of completeCbs) cb(chapter.id);
  }

  /** Registers a wait; abort() can cancel it without ever resolving it. */
  function waitFor<T>(register: (settle: (value: T) => void) => () => void): Promise<T> {
    return new Promise<T>((resolve) => {
      let settled = false;
      const cancel = register((value) => {
        if (settled) return;
        settled = true;
        activeCancel = null;
        resolve(value);
      });
      activeCancel = () => {
        if (settled) return;
        settled = true;
        cancel();
      };
    });
  }

  function waitForSquareTap(): Promise<TapInput> {
    return waitFor<TapInput>((settle) => presenter.onTap(settle));
  }

  function waitTapOrTimeout(ms: number): Promise<void> {
    return waitFor<void>((settle) => {
      const cancelTimer = schedule(ms, () => settle(undefined));
      const unsubTap = presenter.onTapAnywhere(() => settle(undefined));
      return () => {
        cancelTimer();
        unsubTap();
      };
    });
  }

  function waitForTapAnywhere(): Promise<void> {
    return waitFor<void>((settle) => presenter.onTapAnywhere(() => settle(undefined)));
  }

  /** A pause line waits the stated milliseconds, full stop — it is not
   * dialogue, so the "tap through" rule does not apply to it. */
  function waitTimeout(ms: number): Promise<void> {
    return waitFor<void>((settle) => schedule(ms, () => settle(undefined)));
  }

  async function playLines(lines: RawLine[]): Promise<void> {
    for (const raw of lines) {
      if (aborted) return;
      const line = parseLine(raw);
      if (line.kind === "speaker") {
        presenter.showSpeakerLine(line.speaker, line.text);
        await waitTapOrTimeout(readingPause(line.text));
      } else if (line.kind === "stage") {
        for (const [speaker, pose] of Object.entries(line.pose)) {
          presenter.setPose(speaker, pose);
        }
        presenter.showStageLine(line.text);
        await waitTapOrTimeout(STAGE_PAUSE_MS);
      } else {
        await waitTimeout(line.ms);
      }
      if (aborted) return;
      presenter.clearDialogue();
    }
  }

  async function runTap(tap: Tap): Promise<void> {
    await playLines(tap.lead);
    if (aborted) return;

    const origin = resolveOrigin(tap.target, chapter.characters);
    const ctx: ClassifyContext = { boardSize: chapter.board.size, characters: chapter.characters, origin };
    const pool = tap.wrong.filter((entry) => entry.match === undefined);
    let lastPoolIndex: number | undefined;
    let attempt = 0;

    // The prompt is shown once and stays up — including while wrong/plain
    // dialogue plays — until the tap resolves (right or show). It is not
    // re-shown (and so not re-narrated) on every attempt.
    presenter.showPrompt(tap.prompt);

    for (;;) {
      if (aborted) return;
      const tapInput = await waitForSquareTap();
      if (aborted) return;

      if (classifyTap(tapInput, tap.target, ctx)) {
        presenter.clearPrompt();
        if (tapInput.kind === "square") presenter.highlightSquare(tapInput.square);
        await playLines(tap.right);
        return;
      }

      attempt += 1;

      if (attempt <= 2) {
        const classified = tap.wrong.find((entry) => entry.match !== undefined && classifyTap(tapInput, entry.match, ctx));
        if (classified) {
          await playLines(classified.lines);
        } else if (pool.length > 0) {
          const index = pickPoolIndex(pool.length, lastPoolIndex, random);
          lastPoolIndex = index;
          const entry = pool[index];
          if (entry) await playLines(entry.lines);
        }
        // A tap may have no random pool at all (chapter 1 tap 1). If no
        // classified entry fits and there is no pool, there is nothing to
        // play — valid content never reaches this branch (the converter
        // checks it), so this is a silent no-op rather than a crash.
      } else if (attempt === 3) {
        await playLines(tap.plain);
      } else {
        // 4th wrong: show resolves the tap, exactly like a correct answer.
        presenter.clearPrompt();
        await playLines(tap.show);
        const square = findRepresentativeSquare(tap.target, ctx, chapter.board.size);
        if (square) presenter.highlightSquare(square);
        return;
      }
    }
  }

  async function run(): Promise<void> {
    presenter.renderBoard(chapter.board.size);
    for (const [key, info] of Object.entries(chapter.characters)) {
      presenter.placeCharacter(key, info.at);
    }

    await playLines(chapter.open);
    if (aborted) return;

    for (const tap of chapter.taps) {
      await runTap(tap);
      if (aborted) return;
    }

    presenter.showCelebration(chapter.celebration.media);
    await playLines(chapter.celebration.script);
    if (aborted) return;

    presenter.restCelebration();
    await waitForTapAnywhere();
    if (aborted) return;

    emitComplete();
  }

  function start(): void {
    void run();
  }

  function abort(): void {
    if (aborted) return;
    aborted = true;
    activeCancel?.();
    activeCancel = null;
    completeCbs = [];
    presenter.clear();
  }

  return { start, onComplete, abort };
}
