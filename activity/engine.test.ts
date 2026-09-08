import assert from "node:assert/strict";
import { test } from "node:test";
import { createEngine } from "./engine.js";
import {
  alwaysZeroRandom,
  createFakePresenter,
  createManualScheduler,
  flush,
  microtaskScheduler,
  neverScheduler,
  type FakePresenter,
} from "./fake-presenter.js";
import type { Chapter, RawLine, Tap } from "./types.js";

function line(speaker: string, text: string): RawLine {
  return { [speaker]: text };
}

function makeTap(overrides: Partial<Tap> & Pick<Tap, "id" | "prompt" | "target">): Tap {
  return {
    lead: [],
    right: [line("rhino", `right:${overrides.id}`)],
    wrong: [],
    plain: [line("rhino", `plain:${overrides.id}`)],
    show: [line("rhino", `show:${overrides.id}`)],
    ...overrides,
  };
}

function makeChapter(taps: Tap[]): Chapter {
  return {
    id: "test-chapter",
    order: 1,
    title: "Test",
    holds: "test",
    board: { size: 8, pieces: [] },
    characters: { pip: { at: "a1" }, rhino: { at: "h1" } },
    open: [],
    taps,
    celebration: { name: "Test celebration", media: "celebrations/test.gif", script: [] },
  };
}

/** Tracks a cursor into the presenter's speaker-line history, so each check
 * asserts exactly the lines played since the last check — necessary because
 * dialogue auto-advances (via the microtask scheduler) all the way to the
 * next real prompt in a single flush(). */
function historyCursor(presenter: FakePresenter) {
  let cursor = 0;
  return () => {
    const all = presenter.speakerLineHistory();
    const added = all.slice(cursor).map((l) => l.text);
    cursor = all.length;
    return added;
  };
}

// ---------------------------------------------------------------------------
// 1. Four taps, each answered correctly first time, completes and emits once.
// ---------------------------------------------------------------------------

test("four correct taps complete the chapter and emit once", async () => {
  const taps = ["t1", "t2", "t3", "t4"].map((id, i) =>
    makeTap({ id, prompt: `prompt:${id}`, target: { kind: "square", square: `a${i + 1}` } }),
  );
  const chapter = makeChapter(taps);
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });

  const completions: string[] = [];
  engine.onComplete((id) => completions.push(id));

  engine.start();
  await flush();
  assert.equal(presenter.lastPrompt(), "prompt:t1");

  for (let i = 0; i < 4; i += 1) {
    presenter.tapSquare(`a${i + 1}`);
    await flush();
  }

  assert.equal(completions.length, 0); // celebration still waiting on a tap
  presenter.tapAnywhere();
  await flush();

  assert.deepEqual(completions, ["test-chapter"]);
});

// ---------------------------------------------------------------------------
// 2 & 6. Four wrong taps: wrong, different wrong, plain, show — then resolves
// and the next tap begins.
// ---------------------------------------------------------------------------

test("a tap answered wrong four times plays wrong, a different wrong, plain, show, then resolves", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [{ lines: [line("pip", "pool-a")] }, { lines: [line("pip", "pool-b")] }],
  });
  const t2 = makeTap({ id: "t2", prompt: "prompt:t2", target: { kind: "square", square: "a2" } });
  const chapter = makeChapter([t1, t2]);
  const presenter = createFakePresenter();
  // alwaysZeroRandom would repeat the same pool entry if the ladder didn't
  // exclude the last-played entry.
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler, random: alwaysZeroRandom });
  const added = historyCursor(presenter);

  engine.start();
  await flush();
  assert.equal(presenter.lastPrompt(), "prompt:t1");

  presenter.tapSquare("b1"); // wrong, attempt 1
  await flush();
  assert.deepEqual(added(), ["pool-a"]);

  presenter.tapSquare("b1"); // wrong, attempt 2 — must differ from attempt 1
  await flush();
  assert.deepEqual(added(), ["pool-b"]);

  presenter.tapSquare("b1"); // wrong, attempt 3 — plain
  await flush();
  assert.deepEqual(added(), ["plain:t1"]);

  presenter.tapSquare("b1"); // wrong, attempt 4 — show, resolves
  await flush();
  assert.deepEqual(added(), ["show:t1"]);
  assert.equal(presenter.highlighted(), "h1");

  // The next tap has begun.
  assert.equal(presenter.lastPrompt(), "prompt:t2");
});

test("the prompt is shown once per tap and cleared only on resolution", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [{ lines: [line("pip", "pool-a")] }, { lines: [line("pip", "pool-b")] }],
  });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler, random: alwaysZeroRandom });

  engine.start();
  await flush();
  assert.equal(presenter.promptShownCount(), 1);
  assert.equal(presenter.promptClearedCount(), 0);

  presenter.tapSquare("b1"); // wrong, attempt 1
  await flush();
  assert.equal(presenter.promptShownCount(), 1); // not re-shown
  assert.equal(presenter.promptClearedCount(), 0); // still visible

  presenter.tapSquare("b1"); // wrong, attempt 2
  await flush();
  assert.equal(presenter.promptShownCount(), 1);
  assert.equal(presenter.promptClearedCount(), 0);

  presenter.tapSquare("b1"); // wrong, attempt 3 — plain
  await flush();
  assert.equal(presenter.promptShownCount(), 1);
  assert.equal(presenter.promptClearedCount(), 0);

  presenter.tapSquare("b1"); // wrong, attempt 4 — show, resolves
  await flush();
  assert.equal(presenter.promptShownCount(), 1);
  assert.equal(presenter.promptClearedCount(), 1); // cleared exactly once, on resolution
});

// ---------------------------------------------------------------------------
// Pause lines wait the stated milliseconds and are not skipped by a tap.
// ---------------------------------------------------------------------------

test("a pause line waits the stated time and is not skipped by a tap-anywhere", async () => {
  const t1 = makeTap({ id: "t1", prompt: "prompt:t1", target: { kind: "square", square: "h1" } });
  const chapter: Chapter = { ...makeChapter([t1]), open: [{ pause: 500 }] };
  const presenter = createFakePresenter();
  const manual = createManualScheduler();
  const engine = createEngine(chapter, presenter, { scheduler: manual.scheduler });

  engine.start();
  await flush();

  // Still inside the pause: the first tap's prompt has not appeared.
  assert.equal(presenter.lastPrompt(), undefined);
  assert.equal(manual.pendingCount(), 1);

  // A tap-anywhere must not skip a pause line.
  presenter.tapAnywhere();
  await flush();
  assert.equal(presenter.lastPrompt(), undefined);
  assert.equal(manual.pendingCount(), 1);

  // Only the elapse of the stated time advances it.
  manual.fire();
  await flush();
  assert.equal(presenter.lastPrompt(), "prompt:t1");
});

// ---------------------------------------------------------------------------
// 3. Two consecutive wrongs never play the same random pool entry.
// ---------------------------------------------------------------------------

test("two consecutive wrongs never play the same random pool entry", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [{ lines: [line("pip", "pool-a")] }, { lines: [line("pip", "pool-b")] }, { lines: [line("pip", "pool-c")] }],
  });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  // A random source biased to always return the same raw value: if the
  // ladder didn't exclude the last-played entry, this would repeat.
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler, random: alwaysZeroRandom });
  const added = historyCursor(presenter);

  engine.start();
  await flush();

  presenter.tapSquare("b1");
  await flush();
  const first = added();

  presenter.tapSquare("b1");
  await flush();
  const second = added();

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notDeepEqual(first, second);
});

// ---------------------------------------------------------------------------
// 4 & 5. A classified wrong fires when its match fits, not when it does
// not, and fires again on a repeat of the same wrong square.
// ---------------------------------------------------------------------------

test("a classified wrong fires only when its match fits, and repeats on a repeat", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [
      { match: { kind: "square", square: "a1" }, lines: [line("pip", "classified-a1")] },
      { lines: [line("pip", "pool-only")] },
    ],
  });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const added = historyCursor(presenter);

  engine.start();
  await flush();

  presenter.tapSquare("a1"); // matches the classified entry
  await flush();
  assert.deepEqual(added(), ["classified-a1"]);

  presenter.tapSquare("a1"); // same wrong square again — same classified entry
  await flush();
  assert.deepEqual(added(), ["classified-a1"]);
});

test("a classified match does not fire for a square it does not fit", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [
      { match: { kind: "square", square: "a1" }, lines: [line("pip", "classified-a1")] },
      { lines: [line("pip", "pool-only")] },
    ],
  });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const added = historyCursor(presenter);

  engine.start();
  await flush();

  presenter.tapSquare("b1"); // does not match a1
  await flush();
  assert.deepEqual(added(), ["pool-only"]);
});

// ---------------------------------------------------------------------------
// 7. abort mid-chapter emits no completion.
// ---------------------------------------------------------------------------

test("abort mid-chapter emits no completion and leaves cleanly", async () => {
  const t1 = makeTap({ id: "t1", prompt: "prompt:t1", target: { kind: "square", square: "h1" } });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  // neverScheduler: nothing here should auto-resolve; abort must catch the
  // engine genuinely suspended at the first prompt.
  const engine = createEngine(chapter, presenter, { scheduler: neverScheduler });

  const completions: string[] = [];
  engine.onComplete((id) => completions.push(id));

  engine.start();
  await flush();
  assert.equal(presenter.lastPrompt(), "prompt:t1");

  engine.abort();
  await flush();

  // A tap after abort must not resurrect the chapter.
  presenter.tapSquare("h1");
  await flush();

  assert.deepEqual(completions, []);
  assert.equal(presenter.cleared(), true);
});

// ---------------------------------------------------------------------------
// 8. The attempt counter is not observable after a tap resolves.
// ---------------------------------------------------------------------------

test("the engine's public surface exposes no attempt counter", async () => {
  const t1 = makeTap({
    id: "t1",
    prompt: "prompt:t1",
    target: { kind: "square", square: "h1" },
    wrong: [{ lines: [line("pip", "a")] }, { lines: [line("pip", "b")] }],
  });
  const chapter = makeChapter([t1]);
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });

  assert.deepEqual(Object.keys(engine).sort(), ["abort", "onComplete", "start"]);

  engine.start();
  await flush();
  presenter.tapSquare("b1"); // wrong once
  await flush();
  presenter.tapSquare("h1"); // then correct — the tap resolves
  await flush();

  // Still exactly the three methods the contract names. No counter, no log.
  assert.deepEqual(Object.keys(engine).sort(), ["abort", "onComplete", "start"]);
  for (const value of Object.values(engine)) {
    assert.equal(typeof value, "function");
  }
});
