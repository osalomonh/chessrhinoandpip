// End-to-end: the real chapter 1 JSON, played through the real engine and
// classify logic, with a fake (DOM-free) presenter standing in for the DOM.

import assert from "node:assert/strict";
import { test } from "node:test";
import chapterData from "../stories/rhino-and-pip/chapters/ch01.json" with { type: "json" };
import { parseChapter } from "./chapter.js";
import { createEngine } from "./engine.js";
import { createFakePresenter, flush, microtaskScheduler, type FakePresenter } from "./fake-presenter.js";

const chapter = parseChapter(chapterData);

/** Tracks a cursor into the presenter's speaker-line history: each call
 * returns only the text played since the last call. Necessary because a
 * real response tier is several lines long and, with the microtask
 * scheduler, plays them all in a single flush(). */
function historyCursor(presenter: FakePresenter) {
  let cursor = 0;
  return () => {
    const all = presenter.speakerLineHistory();
    const added = all.slice(cursor).map((l) => l.text);
    cursor = all.length;
    return added;
  };
}

test("ch01 tap 1: the a1 and h8 classified squares each play their own line, then plain, then show resolves", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const added = historyCursor(presenter);

  engine.start();
  await flush();
  assert.equal(presenter.lastPrompt(), "Tap the light corner.");

  presenter.tapSquare("a1"); // Pip's own dark corner
  await flush();
  assert.ok(added().includes("See. They like mine."));

  presenter.tapSquare("h8"); // the far light corner
  await flush();
  assert.ok(added().includes("That is a corner. That is light."));

  // Attempts 1 and 2 are spent; attempt 3 is unconditionally "plain",
  // regardless of which square (here, one that would otherwise classify).
  presenter.tapSquare("b1");
  await flush();
  assert.deepEqual(added(), ["Your right hand. That corner. The light one."]);

  // Attempt 4: show resolves the tap regardless of what is tapped.
  presenter.tapSquare("c1");
  await flush();
  assert.ok(added().length > 0);
  assert.equal(presenter.highlighted(), "h1");
  assert.equal(presenter.lastPrompt(), "Tap a light square.");
});

test("ch01 tap 1: the light-square and dark-square classified entries fire independently", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const added = historyCursor(presenter);

  engine.start();
  await flush();

  presenter.tapSquare("b1"); // light, not a1/h8 — hits the colour:light entry
  await flush();
  assert.ok(added().includes("That one is light."));

  presenter.tapSquare("c1"); // dark, not a1 — hits the colour:dark entry
  await flush();
  assert.ok(added().includes("Another one of mine."));

  // Resolve this tap by tapping correctly before moving on.
  presenter.tapSquare("h1");
  await flush();
  assert.ok(added().includes("Oh."));
  assert.equal(presenter.lastPrompt(), "Tap a light square.");
});

test("ch01 tap 4: adjacent-orthogonal target, with its sameColour and h1 classified entries", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const added = historyCursor(presenter);

  engine.start();
  await flush();

  // Walk taps 1-3 with correct answers.
  presenter.tapSquare("h1");
  await flush();
  added();
  assert.equal(presenter.lastPrompt(), "Tap a light square.");

  presenter.tapSquare("b1");
  await flush();
  added();
  assert.equal(presenter.lastPrompt(), "Tap a dark square.");

  presenter.tapSquare("c1");
  await flush();
  added();
  assert.equal(presenter.lastPrompt(), "Tap the square next to Rhino’s foot. Other colour.");

  // g2 is diagonally adjacent to Rhino (h1) and shares h1's colour (light).
  presenter.tapSquare("g2");
  await flush();
  assert.ok(added().includes("That one is next to me."));

  // Tapping Rhino's own square.
  presenter.tapSquare("h1");
  await flush();
  assert.ok(added().includes("I tapped you."));

  // Attempt 3: unconditionally plain, regardless of the square tapped.
  presenter.tapSquare("a8");
  await flush();
  assert.deepEqual(added(), ["Touching this one. Different colour."]);

  // Attempt 4: show resolves. The target is "adjacent", not a named square,
  // so the runtime computes a representative correct square: scanning
  // a1..h1, a2..h2, ... and preferring an orthogonal neighbour of Rhino
  // (h1), the first hit is g1 (h1's other orthogonal neighbour, h2, comes
  // later in the scan).
  presenter.tapSquare("a8");
  await flush();
  assert.ok(added().length > 0);
  assert.equal(presenter.highlighted(), "g1");
});

test("ch01 tap 2: show highlights a representative light square (b1)", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });

  engine.start();
  await flush();
  presenter.tapSquare("h1"); // t1: correct
  await flush();
  assert.equal(presenter.lastPrompt(), "Tap a light square.");

  // a1 is dark — wrong for "tap a light square" — on all four attempts.
  presenter.tapSquare("a1");
  await flush();
  presenter.tapSquare("a1");
  await flush();
  presenter.tapSquare("a1");
  await flush();
  presenter.tapSquare("a1"); // attempt 4: show resolves
  await flush();

  // First light square in scan order a1..h1, a2..h2, ...
  assert.equal(presenter.highlighted(), "b1");
  assert.equal(presenter.lastPrompt(), "Tap a dark square.");
});

test("ch01 tap 3: show highlights a representative dark square (a1)", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });

  engine.start();
  await flush();
  presenter.tapSquare("h1"); // t1: correct
  await flush();
  presenter.tapSquare("b1"); // t2: correct
  await flush();
  assert.equal(presenter.lastPrompt(), "Tap a dark square.");

  // b1 is light — wrong for "tap a dark square" — on all four attempts.
  presenter.tapSquare("b1");
  await flush();
  presenter.tapSquare("b1");
  await flush();
  presenter.tapSquare("b1");
  await flush();
  presenter.tapSquare("b1"); // attempt 4: show resolves
  await flush();

  // First dark square in scan order a1..h1, a2..h2, ...
  assert.equal(presenter.highlighted(), "a1");
  assert.equal(presenter.lastPrompt(), "Tap the square next to Rhino’s foot. Other colour.");
});

test("ch01 end to end: correct answers throughout complete the chapter and emit once", async () => {
  const presenter = createFakePresenter();
  const engine = createEngine(chapter, presenter, { scheduler: microtaskScheduler });
  const completions: string[] = [];
  engine.onComplete((id) => completions.push(id));

  engine.start();
  await flush();

  presenter.tapSquare("h1"); // t1: the light corner
  await flush();
  presenter.tapSquare("b1"); // t2: a light square
  await flush();
  presenter.tapSquare("c1"); // t3: a dark square
  await flush();
  presenter.tapSquare("g1"); // t4: orthogonal to Rhino, other colour
  await flush();

  assert.equal(presenter.celebrationMedia(), "celebrations/ch01_very_tall_ice_cream.gif");
  assert.equal(completions.length, 0); // still resting on the final frame

  presenter.tapAnywhere(); // rest on the final frame, then complete
  await flush();

  assert.deepEqual(completions, ["ch01"]);
});
