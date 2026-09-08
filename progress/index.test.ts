import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createProgressStore,
  type ProgressStore,
  type StorageLike,
} from "./index.js";
import pack from "../stories/rhino-and-pip/pack.json" with { type: "json" };

const STORAGE_KEY = "rhino-and-pip:progress";

/** A fake in-memory storage for tests, with optional throwing behaviour. */
function createFakeStorage(options?: {
  throwOnGet?: boolean;
  throwOnSet?: boolean;
}): StorageLike & { raw(): string | null } {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      if (options?.throwOnGet) throw new Error("get failed");
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      if (options?.throwOnSet) throw new Error("set failed");
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
    raw() {
      return map.has(STORAGE_KEY) ? map.get(STORAGE_KEY)! : null;
    },
  };
}

function freshStore(): {
  store: ProgressStore;
  storage: ReturnType<typeof createFakeStorage>;
} {
  const storage = createFakeStorage();
  const store = createProgressStore(storage);
  return { store, storage };
}

test("load returns a fresh empty progress when nothing is stored", () => {
  const { store } = freshStore();
  const progress = store.load();
  assert.deepEqual(progress, {
    version: 1,
    pack: "rhino-and-pip",
    chapters: {},
  });
});

test("load round-trips what markComplete wrote", () => {
  const { store } = freshStore();
  store.markComplete("ch01");
  const progress = store.load();
  assert.equal(progress.chapters["ch01"]?.complete, true);
  assert.equal(typeof progress.chapters["ch01"]?.completedAt, "string");
});

test("load returns fresh progress on unparseable JSON", () => {
  const { store, storage } = freshStore();
  storage.setItem(STORAGE_KEY, "{not json");
  const progress = store.load();
  assert.deepEqual(progress, {
    version: 1,
    pack: "rhino-and-pip",
    chapters: {},
  });
});

test("load returns fresh progress on a different version", () => {
  const { store, storage } = freshStore();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      pack: "rhino-and-pip",
      chapters: { ch01: { complete: true, completedAt: "2026-01-01T00:00:00Z" } },
    }),
  );
  const progress = store.load();
  assert.deepEqual(progress.chapters, {});
});

test("load returns fresh progress on a different pack", () => {
  const { store, storage } = freshStore();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      pack: "some-other-pack",
      chapters: { ch01: { complete: true, completedAt: "2026-01-01T00:00:00Z" } },
    }),
  );
  const progress = store.load();
  assert.deepEqual(progress.chapters, {});
});

test("load drops unknown top-level keys and malformed chapter entries", () => {
  const { store, storage } = freshStore();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      pack: "rhino-and-pip",
      secretField: "should be dropped",
      chapters: {
        ch01: { complete: true, completedAt: "2026-01-01T00:00:00Z" },
        ch02: { complete: false, completedAt: "2026-01-01T00:00:00Z" },
        ch03: { complete: true },
        ch04: { complete: true, completedAt: "2026-01-01T00:00:00Z", attempts: 3 },
        ch05: "not an object",
      },
    }),
  );
  const progress = store.load();
  assert.deepEqual(Object.keys(progress), ["version", "pack", "chapters"]);
  assert.deepEqual(Object.keys(progress.chapters).sort(), ["ch01", "ch04"]);
  // ch04's malformed extra key (attempts) must be dropped from the parsed record.
  assert.deepEqual(Object.keys(progress.chapters["ch04"] ?? {}).sort(), [
    "complete",
    "completedAt",
  ]);
});

test("markComplete writes complete + completedAt with a valid ISO timestamp", () => {
  const { store } = freshStore();
  store.markComplete("ch01");
  const record = store.load().chapters["ch01"];
  assert.ok(record);
  assert.equal(record?.complete, true);
  assert.ok(record && !Number.isNaN(Date.parse(record.completedAt)));
});

test("markComplete is idempotent: second call keeps the first completedAt", () => {
  const { store } = freshStore();
  store.markComplete("ch01");
  const first = store.load().chapters["ch01"]?.completedAt;
  store.markComplete("ch01");
  const second = store.load().chapters["ch01"]?.completedAt;
  assert.equal(second, first);
});

test("isComplete is false before and true after markComplete", () => {
  const { store } = freshStore();
  assert.equal(store.isComplete("ch01"), false);
  store.markComplete("ch01");
  assert.equal(store.isComplete("ch01"), true);
});

test("isComplete is false for an unknown chapter id", () => {
  const { store } = freshStore();
  store.markComplete("ch01");
  assert.equal(store.isComplete("ch99"), false);
});

test("currentChapter returns the first incomplete chapter in pack order", () => {
  const { store } = freshStore();
  const manifest = { id: "test-pack", chapters: ["a", "b", "c"] };
  assert.equal(store.currentChapter(manifest), "a");
  store.markComplete("a");
  assert.equal(store.currentChapter(manifest), "b");
});

test("currentChapter skips completed chapters and returns the last one when all are complete", () => {
  const { store } = freshStore();
  const manifest = { id: "test-pack", chapters: ["a", "b", "c"] };
  store.markComplete("a");
  store.markComplete("b");
  assert.equal(store.currentChapter(manifest), "c");
  store.markComplete("c");
  assert.equal(store.currentChapter(manifest), "c");
});

test("currentChapter works against the real rhino-and-pip pack chapter list", () => {
  const { store } = freshStore();
  const manifest = { id: pack.id, chapters: pack.chapters };
  assert.equal(store.currentChapter(manifest), pack.chapters[0]);
  for (const chapterId of pack.chapters) {
    store.markComplete(chapterId);
  }
  assert.equal(
    store.currentChapter(manifest),
    pack.chapters[pack.chapters.length - 1],
  );
});

test("currentChapter throws a clear error for an empty chapters array", () => {
  const { store } = freshStore();
  assert.throws(
    () => store.currentChapter({ id: "empty-pack", chapters: [] }),
    /chapters must not be empty/i,
  );
});

test("the object written to storage contains only the contract's keys", () => {
  const { store, storage } = freshStore();
  store.markComplete("ch01");
  const raw = storage.raw();
  assert.ok(raw);
  const parsed: unknown = JSON.parse(raw ?? "{}");
  assert.deepEqual(Object.keys(parsed as object).sort(), [
    "chapters",
    "pack",
    "version",
  ]);
  const chapters = (parsed as { chapters: Record<string, unknown> }).chapters;
  for (const entry of Object.values(chapters)) {
    assert.deepEqual(Object.keys(entry as object).sort(), [
      "complete",
      "completedAt",
    ]);
  }
});

test("functions do not throw when storage throws on get", () => {
  const storage = createFakeStorage({ throwOnGet: true });
  const store = createProgressStore(storage);
  assert.doesNotThrow(() => store.load());
  assert.doesNotThrow(() => store.isComplete("ch01"));
  assert.doesNotThrow(() => store.markComplete("ch01"));
  assert.doesNotThrow(() =>
    store.currentChapter({ id: "test-pack", chapters: ["a", "b"] }),
  );
});

test("functions do not throw when storage throws on set", () => {
  const storage = createFakeStorage({ throwOnSet: true });
  const store = createProgressStore(storage);
  assert.doesNotThrow(() => store.markComplete("ch01"));
  // The primary write failed, but the store falls back to an in-memory
  // store for the rest of the session, so the completion still reads back.
  assert.equal(store.isComplete("ch01"), true);
});

test("a storage that throws on setItem falls back to memory after the first failure, touching only the real key", () => {
  const touchedKeys: string[] = [];
  let primarySetItemCalls = 0;
  const storage: StorageLike = {
    getItem(key) {
      touchedKeys.push(key);
      return null;
    },
    setItem(key) {
      touchedKeys.push(key);
      primarySetItemCalls++;
      throw new Error("quota exceeded");
    },
    removeItem(key) {
      touchedKeys.push(key);
    },
  };
  const store = createProgressStore(storage);

  store.markComplete("ch01");
  assert.equal(store.isComplete("ch01"), true);

  // A second round trip after the fallback has kicked in should still work,
  // entirely in memory, without ever touching the primary storage again.
  store.markComplete("ch02");
  assert.equal(store.isComplete("ch02"), true);
  assert.equal(store.isComplete("ch01"), true);

  assert.deepEqual(new Set(touchedKeys), new Set([STORAGE_KEY]));
  // Only the first setItem call should have reached the throwing primary;
  // every call after the failure is served by the in-memory fallback.
  assert.equal(primarySetItemCalls, 1);
});
