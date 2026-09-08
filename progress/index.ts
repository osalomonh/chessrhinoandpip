/**
 * progress — what a child has completed.
 *
 * Stores only completion, per chapter, under one localStorage key.
 * See contracts/progress.md for the shape and rules.
 */

const STORAGE_KEY = "rhino-and-pip:progress";
const PACK_ID = "rhino-and-pip";
const VERSION = 1;

/** A single chapter's completion record. Nothing else may live here. */
export interface ChapterRecord {
  complete: true;
  completedAt: string;
}

/** The full stored shape. Nothing else may live here. */
export interface Progress {
  version: 1;
  pack: string;
  chapters: Record<string, ChapterRecord>;
}

/**
 * Minimal structural manifest shape needed by currentChapter.
 * Deliberately not imported from stories/ or activity/ — this is the
 * smallest shape that satisfies the contract.
 */
export interface PackManifest {
  id: string;
  chapters: readonly string[];
}

/** The minimal storage interface the store depends on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function freshProgress(): Progress {
  return { version: VERSION, pack: PACK_ID, chapters: {} };
}

function isChapterRecord(value: unknown): value is ChapterRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record["complete"] === true && typeof record["completedAt"] === "string"
  );
}

/**
 * Parse a raw stored string into a Progress, falling back to a fresh
 * empty progress for anything that does not match the expected shape.
 * Unknown top-level keys and malformed chapter entries are dropped.
 */
function parseStored(raw: string | null): Progress {
  if (raw === null) return freshProgress();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return freshProgress();
  }

  if (typeof parsed !== "object" || parsed === null) return freshProgress();
  const obj = parsed as Record<string, unknown>;

  if (obj["version"] !== VERSION) return freshProgress();
  if (obj["pack"] !== PACK_ID) return freshProgress();

  const rawChapters = obj["chapters"];
  if (typeof rawChapters !== "object" || rawChapters === null) {
    return freshProgress();
  }

  const chapters: Record<string, ChapterRecord> = {};
  for (const [chapterId, value] of Object.entries(
    rawChapters as Record<string, unknown>,
  )) {
    if (isChapterRecord(value)) {
      chapters[chapterId] = { complete: true, completedAt: value.completedAt };
    }
    // Malformed entries are silently dropped, per contract.
  }

  return { version: VERSION, pack: PACK_ID, chapters };
}

/** A simple in-memory fallback used when localStorage is unavailable or throws. */
function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function resolveDefaultStorage(): StorageLike {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike })
      .localStorage;
    if (candidate) {
      return candidate;
    }
  } catch {
    // Accessing globalThis.localStorage itself threw: fall through to memory.
  }
  return createMemoryStorage();
}

/**
 * Wraps a storage so that the first time either getItem or setItem throws
 * (private mode, blocked storage, quota exceeded, and so on), every call for
 * the rest of the session is served by an in-memory fallback instead. This
 * never writes or reads a throwaway probe key — the real key is the first
 * and only key ever touched, and the switch happens only on a genuine
 * failure of a real read or write.
 */
function createResilientStorage(primary: StorageLike): StorageLike {
  let useMemory = false;
  let memory: StorageLike | undefined;

  function getMemory(): StorageLike {
    if (!memory) memory = createMemoryStorage();
    return memory;
  }

  return {
    getItem(key) {
      if (useMemory) return getMemory().getItem(key);
      try {
        return primary.getItem(key);
      } catch {
        useMemory = true;
        return getMemory().getItem(key);
      }
    },
    setItem(key, value) {
      if (useMemory) {
        getMemory().setItem(key, value);
        return;
      }
      try {
        primary.setItem(key, value);
      } catch {
        useMemory = true;
        getMemory().setItem(key, value);
      }
    },
    removeItem(key) {
      if (useMemory) {
        getMemory().removeItem?.(key);
        return;
      }
      try {
        primary.removeItem?.(key);
      } catch {
        useMemory = true;
        getMemory().removeItem?.(key);
      }
    },
  };
}

/**
 * A progress store bound to a particular storage backend. Exported so
 * tests can substitute a fake storage; the four module-level functions
 * below delegate to a default instance bound to localStorage (or an
 * in-memory fallback).
 */
export interface ProgressStore {
  load(): Progress;
  markComplete(chapterId: string): void;
  isComplete(chapterId: string): boolean;
  currentChapter(pack: PackManifest): string;
}

export function createProgressStore(storage: StorageLike): ProgressStore {
  // Wrapping here (rather than only at the default-storage resolution
  // point) means any storage handed in — including a fake used by tests —
  // gets the same fall-to-memory-on-first-failure behaviour.
  const resilientStorage = createResilientStorage(storage);

  function load(): Progress {
    return parseStored(resilientStorage.getItem(STORAGE_KEY));
  }

  function save(progress: Progress): void {
    resilientStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function markComplete(chapterId: string): void {
    const progress = load();
    const existing = progress.chapters[chapterId];
    if (existing) {
      // Idempotent: keep the original completedAt.
      return;
    }
    progress.chapters[chapterId] = {
      complete: true,
      completedAt: new Date().toISOString(),
    };
    save(progress);
  }

  function isComplete(chapterId: string): boolean {
    return load().chapters[chapterId]?.complete === true;
  }

  function currentChapter(pack: PackManifest): string {
    const chapters = pack.chapters;
    const progress = load();
    for (const chapterId of chapters) {
      if (progress.chapters[chapterId]?.complete !== true) {
        return chapterId;
      }
    }
    // All complete (or the pack has no chapters, which should not happen):
    // return the last chapter.
    const last = chapters[chapters.length - 1];
    if (last === undefined) {
      throw new Error("PackManifest.chapters must not be empty");
    }
    return last;
  }

  return { load, markComplete, isComplete, currentChapter };
}

const defaultStore = createProgressStore(resolveDefaultStorage());

export function load(): Progress {
  return defaultStore.load();
}

export function markComplete(chapterId: string): void {
  defaultStore.markComplete(chapterId);
}

export function isComplete(chapterId: string): boolean {
  return defaultStore.isComplete(chapterId);
}

export function currentChapter(pack: PackManifest): string {
  return defaultStore.currentChapter(pack);
}
