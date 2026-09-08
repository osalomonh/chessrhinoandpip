import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPath, pathSquareClasses, type PathEntry } from "./path-model.js";

const chapterIds = Array.from({ length: 16 }, (_, i) => `ch${String(i + 1).padStart(2, "0")}`);

function isComplete(done: Set<string>): (id: string) => boolean {
  return (id) => done.has(id);
}

test("sixteen chapter entries plus a trailing free-play entry", () => {
  const entries = buildPath(chapterIds, isComplete(new Set()), "ch01");
  assert.equal(entries.length, 17);
  const chapters = entries.filter((e): e is Extract<PathEntry, { kind: "chapter" }> => e.kind === "chapter");
  assert.equal(chapters.length, 16);
});

test("colour alternates starting dark", () => {
  const entries = buildPath(chapterIds, isComplete(new Set()), "ch01");
  const colors = entries
    .filter((e): e is Extract<PathEntry, { kind: "chapter" }> => e.kind === "chapter")
    .map((e) => e.color);
  assert.equal(colors[0], "dark");
  for (let i = 0; i < colors.length; i += 1) {
    assert.equal(colors[i], i % 2 === 0 ? "dark" : "light");
  }
});

test("exactly one square is current, and it is the current chapter", () => {
  const entries = buildPath(chapterIds, isComplete(new Set()), "ch05");
  const chapters = entries.filter((e): e is Extract<PathEntry, { kind: "chapter" }> => e.kind === "chapter");
  const current = chapters.filter((e) => e.state === "current");
  assert.equal(current.length, 1);
  assert.equal(current[0]?.id, "ch05");
});

test("completed chapters before the current one are done; the rest are undone", () => {
  const done = new Set(["ch01", "ch02", "ch03"]);
  const entries = buildPath(chapterIds, isComplete(done), "ch04");
  const chapters = entries.filter((e): e is Extract<PathEntry, { kind: "chapter" }> => e.kind === "chapter");

  for (const entry of chapters) {
    if (entry.id === "ch04") {
      assert.equal(entry.state, "current");
    } else if (done.has(entry.id)) {
      assert.equal(entry.state, "done");
    } else {
      assert.equal(entry.state, "undone");
    }
  }
});

test("all chapters complete makes the last one current", () => {
  const done = new Set(chapterIds);
  const currentId = chapterIds[chapterIds.length - 1] as string;
  const entries = buildPath(chapterIds, isComplete(done), currentId);
  const chapters = entries.filter((e): e is Extract<PathEntry, { kind: "chapter" }> => e.kind === "chapter");
  const current = chapters.filter((e) => e.state === "current");
  assert.equal(current.length, 1);
  assert.equal(current[0]?.id, currentId);
  // Every other chapter (all of them are "done" per progress) is done, not undone.
  for (const entry of chapters) {
    if (entry.id !== currentId) assert.equal(entry.state, "done");
  }
});

test("the free-play square is present, last, and not a chapter", () => {
  const entries = buildPath(chapterIds, isComplete(new Set()), "ch01");
  const last = entries[entries.length - 1];
  assert.ok(last);
  assert.equal(last.kind, "freePlay");
  assert.equal(entries.filter((e) => e.kind === "freePlay").length, 1);
});

test("pathSquareClasses: a chapter square gets a base, colour and state class", () => {
  const entries = buildPath(chapterIds, isComplete(new Set()), "ch01");
  const first = entries[0];
  assert.ok(first && first.kind === "chapter");
  const classes = pathSquareClasses(first);
  assert.deepEqual(classes, ["path-square", "path-square--dark", "path-square--current"]);
});

test("pathSquareClasses: the free-play square gets its own class only", () => {
  const classes = pathSquareClasses({ kind: "freePlay" });
  assert.deepEqual(classes, ["path-square", "path-square--freeplay"]);
});
