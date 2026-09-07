import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPackJson,
  convertChapter,
  ConvertError,
  parseLines,
  validateChapter,
  type Chapter,
} from "./convert.js";
import type { JsonSchema } from "./schema-validate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SCHEMA_PATH = join(REPO_ROOT, "proposals", "chapter-format.schema.json");
const REAL_SCRIPT_PATH = join(REPO_ROOT, "stories", "rhino-and-pip", "scripts", "series-1.txt");

function schema(): JsonSchema {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as JsonSchema;
}

const EM = "—"; // — used by every section marker in the script grammar

// A complete, valid, minimal one-tap chapter. Every test below starts from
// this and changes exactly one thing, so a failing assertion points at the
// behaviour under test rather than at fixture noise.
function minimalChapter(opts: {
  tapPrompt?: string;
  wrongBlock?: string;
  rightExtra?: string;
} = {}): string {
  const tapPrompt = opts.tapPrompt ?? "Tap a light square.";
  const wrongBlock =
    opts.wrongBlock ??
    `WRONG ${EM} classified. Match the square.
any dark square:
   Rhino:  That one is dark.
   Pip:    Oops.
somewhere else:
   Pip:    Not that either.
   Rhino:  Try the light one.`;
  const rightExtra = opts.rightExtra ?? "";

  return `
================================================================
CHAPTER 1 ${EM} TEST CHAPTER
================================================================

Quietly holding: a test fixture.
Taps: 1.
Celebration: The Very Tall Ice Cream.

OPEN

The floor is already there. No pieces.
Pip stands on the near-left corner.
Rhino stands on the near-right corner.

Pip:    Ready.
Rhino:  Ready.

TAP 1 ${EM} ${tapPrompt}

RIGHT
Pip:    Yes.
Rhino:  Good.${rightExtra}

${wrongBlock}

PLAIN LINE
Rhino:  A light square, please.

SHOW ${EM} fourth miss. Pip finds it. The tap completes.
Pip stumbles onto a light square.
Pip:    Whoops.
Rhino:  That is the one.
Pip:    Lucky.

CELEBRATION ${EM} The Very Tall Ice Cream

An ice cream arrives.
Pip:    Yay.
Rhino:  Nice.
`;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("a full minimal chapter converts to the expected shape", () => {
  const chapter = convertChapter(minimalChapter(), 1);
  assert.equal(chapter.id, "ch01");
  assert.equal(chapter.order, 1);
  assert.equal(chapter.title, "TEST CHAPTER");
  assert.equal(chapter.holds, "a test fixture.");
  assert.deepEqual(chapter.board, { size: 8, pieces: [] });
  assert.deepEqual(chapter.characters, { pip: { at: "a1" }, rhino: { at: "h1" } });
  assert.deepEqual(chapter.open, [
    { stage: "The floor is already there. No pieces. Pip stands on the near-left corner. Rhino stands on the near-right corner." },
    { pip: "Ready." },
    { rhino: "Ready." },
  ]);
  assert.equal(chapter.taps.length, 1);
  const tap = chapter.taps[0]!;
  assert.equal(tap.id, "t1");
  assert.equal(tap.prompt, "Tap a light square.");
  assert.deepEqual(tap.target, { kind: "colour", colour: "light" });
  assert.deepEqual(tap.right, [{ pip: "Yes." }, { rhino: "Good." }]);
  assert.deepEqual(tap.wrong, [
    { match: { kind: "colour", colour: "dark" }, lines: [{ rhino: "That one is dark." }, { pip: "Oops." }] },
    { match: { kind: "fallback" }, lines: [{ pip: "Not that either." }, { rhino: "Try the light one." }] },
  ]);
  assert.deepEqual(tap.plain, [{ rhino: "A light square, please." }]);
  assert.deepEqual(tap.show, [
    { stage: "Pip stumbles onto a light square." },
    { pip: "Whoops." },
    { rhino: "That is the one." },
    { pip: "Lucky." },
  ]);
  assert.equal(chapter.celebration.name, "The Very Tall Ice Cream");
  assert.equal(chapter.celebration.media, "celebrations/ch01_very_tall_ice_cream.gif");
  assert.deepEqual(chapter.celebration.script, [
    { stage: "An ice cream arrives." },
    { pip: "Yay." },
    { rhino: "Nice." },
  ]);

  const errors = validateChapter(chapter, schema());
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// Structural failures
// ---------------------------------------------------------------------------

test("a tap missing a tier fails, naming the chapter, tap, and tier", () => {
  const script = minimalChapter().replace(/PLAIN LINE\nRhino:  A light square, please\.\n\n/, "");
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /ch01/);
      assert.match(err.message, /t1/);
      assert.match(err.message, /missing PLAIN tier/);
      return true;
    },
  );
});

test("an unknown classifier label fails, naming it", () => {
  const script = minimalChapter({
    wrongBlock: `WRONG ${EM} classified. Match the square.
a green square:
   Pip:    That is new.
   Rhino:  That is not a real label.
somewhere else:
   Pip:    Not that either.
   Rhino:  Try the light one.`,
  });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /"a green square"/);
      assert.match(err.message, /not in contracts\/classifiers\.json/);
      return true;
    },
  );
});

test("an unresolved classifier label fails, naming the missing capability", () => {
  const script = minimalChapter({
    wrongBlock: `WRONG ${EM} classified. Match the square.
wrong letter:
   Rhino:  That letter is not right.
   Pip:    Letters are hard.
somewhere else:
   Pip:    Not that either.
   Rhino:  Try the light one.`,
  });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /"wrong letter"/);
      assert.match(err.message, /needsChapterContext/);
      return true;
    },
  );
});

test("fallback not last fails, naming the rule", () => {
  const script = minimalChapter({
    wrongBlock: `WRONG ${EM} classified. Match the square.
somewhere else:
   Pip:    Not that either.
   Rhino:  Try the light one.
any dark square:
   Rhino:  That one is dark.
   Pip:    Oops.`,
  });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /ch01/);
      assert.match(err.message, /t1/);
      assert.match(err.message, /fallback/i);
      assert.match(err.message, /not last/);
      return true;
    },
  );
});

test("an exclamation mark outside a celebration script fails", () => {
  const script = minimalChapter({ rightExtra: "\nPip:    Wow!" });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /exclamation mark/);
      return true;
    },
  );
});

test("a Show missing the exact line from the non-erring speaker fails", () => {
  const script = minimalChapter().replace(
    "Rhino:  That is the one.\n",
    "Rhino:  You found it.\n",
  );
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /"That is the one\."/);
      assert.match(err.message, /rhino/);
      return true;
    },
  );
});

test("an unknown prompt fails, naming the prompt", () => {
  const script = minimalChapter({ tapPrompt: "Tap the moon." });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /"Tap the moon\."/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Second-person heuristic
// ---------------------------------------------------------------------------

test("second-person heuristic rejects an obvious child-addressed line", () => {
  const script = minimalChapter({
    wrongBlock: `WRONG ${EM} one miss type (any dark). Pick 1 of 3.
1  Rhino:  You tapped the dark one. Try again.
   Pip:    Oh no.
2  Pip:    That is one of mine.
   Rhino:  Later.
3  Pip:    Rude.
   Rhino:  A light one.`,
  });
  assert.throws(
    () => convertChapter(script, 1),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /second person/);
      return true;
    },
  );
});

test("second-person heuristic accepts the contract's own worked example", () => {
  const script = minimalChapter({
    wrongBlock: `WRONG ${EM} one miss type (any dark). Pick 1 of 3.
1  Rhino:  They tapped yours. Yours is dark.
   Pip:    Oh well.
2  Pip:    That is one of mine.
   Rhino:  Later.
3  Pip:    Rude.
   Rhino:  A light one.`,
  });
  const chapter = convertChapter(script, 1);
  assert.deepEqual(chapter.taps[0]!.wrong[0]!.lines[0], { rhino: "They tapped yours. Yours is dark." });
});

// ---------------------------------------------------------------------------
// Pose tags: "[speaker:pose] prose..." on a stage line
// ---------------------------------------------------------------------------

test("a tagged stage line yields the pose field and stripped prose", () => {
  const lines = parseLines(
    ["[pip:sitting] Pip sits down hard on the near-right corner."],
    { chapterId: "ch01", tapId: "t1" },
  );
  assert.deepEqual(lines, [
    { stage: "Pip sits down hard on the near-right corner.", pose: { pip: "sitting" } },
  ]);
});

test("two tags on one line both land in the pose field", () => {
  const lines = parseLines(
    ["[pip:sitting] [rhino:step] They stand together on the near squares."],
    { chapterId: "ch01", tapId: "t4" },
  );
  assert.deepEqual(lines, [
    {
      stage: "They stand together on the near squares.",
      pose: { pip: "sitting", rhino: "step" },
    },
  ]);
});

test("a pose tag naming an unknown speaker fails, naming chapter/tap/line", () => {
  assert.throws(
    () => parseLines(["[fox:sitting] Something happens."], { chapterId: "ch01", tapId: "t1" }),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /ch01/);
      assert.match(err.message, /t1/);
      assert.match(err.message, /"fox"/);
      return true;
    },
  );
});

test("a malformed bracket tag fails rather than being absorbed into the prose", () => {
  assert.throws(
    () => parseLines(["[pip sitting] Pip does something."], { chapterId: "ch01", tapId: "t1" }),
    (err: unknown) => {
      assert.ok(err instanceof ConvertError);
      assert.match(err.message, /malformed pose tag/);
      assert.match(err.message, /\[pip sitting\]/);
      return true;
    },
  );
});

test("a pose tag with no matching PNG warns to stderr but still converts", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg?: unknown) => {
    warnings.push(String(msg));
  };
  try {
    const script = minimalChapter({
      rightExtra: "\n[pip:doesnotexist] Pip does a little dance.",
    });
    const chapter = convertChapter(script, 1);
    assert.deepEqual(chapter.taps[0]!.right[2], {
      stage: "Pip does a little dance.",
      pose: { pip: "doesnotexist" },
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /WARNING ch01 t1 \[right\]/);
  assert.match(warnings[0]!, /pose "pip:doesnotexist"/);
  assert.match(warnings[0]!, /falls back to idle/);
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test("schema validation rejects a malformed chapter", () => {
  const chapter = convertChapter(minimalChapter(), 1);
  const malformed = { ...chapter } as Partial<Chapter> as Record<string, unknown>;
  delete malformed.board;
  const errors = validateChapter(malformed as unknown as Chapter, schema());
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /board/);
});

test("schema validation rejects a wrong-typed field", () => {
  const chapter = convertChapter(minimalChapter(), 1);
  const malformed = { ...chapter, order: "one" } as unknown as Chapter;
  const errors = validateChapter(malformed, schema());
  assert.ok(errors.length > 0);
});

// ---------------------------------------------------------------------------
// parseLines: dialogue continuation vs. stage paragraphs
// ---------------------------------------------------------------------------

test("parseLines joins indented continuation lines onto the preceding dialogue line", () => {
  const lines = parseLines([
    "Pip:    That cannot be right.",
    "         Dark has mystery.",
    "         Dark has style.",
    "Rhino:  We should ask.",
  ]);
  assert.deepEqual(lines, [
    { pip: "That cannot be right. Dark has mystery. Dark has style." },
    { rhino: "We should ask." },
  ]);
});

test("parseLines joins contiguous unprefixed lines into one stage line", () => {
  const lines = parseLines([
    "Pip sits down hard on the near-right corner.",
    "He looks surprised to be there.",
  ]);
  assert.deepEqual(lines, [
    { stage: "Pip sits down hard on the near-right corner. He looks surprised to be there." },
  ]);
});

// ---------------------------------------------------------------------------
// pack.json
// ---------------------------------------------------------------------------

test("pack.json speakers and poses come from the files actually present", () => {
  const pack = buildPackJson();
  const speakersDir = join(REPO_ROOT, "stories", "rhino-and-pip", "speakers");
  for (const key of readdirSync(speakersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const expectedPoses = readdirSync(join(speakersDir, key))
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .map((f) => f.slice(0, -".png".length))
      .sort();
    assert.ok(pack.speakers[key], `pack.json is missing speaker "${key}"`);
    assert.deepEqual(pack.speakers[key]!.poses, expectedPoses);
    assert.ok(pack.speakers[key]!.poses.includes("idle"), `speaker "${key}" has no idle pose`);
  }
  assert.deepEqual(pack.chapters, [
    "ch01", "ch02", "ch03", "ch04", "ch05", "ch06", "ch07", "ch08",
    "ch09", "ch10", "ch11", "ch12", "ch13", "ch14", "ch15", "ch16",
  ]);
});

// ---------------------------------------------------------------------------
// The real script, chapter 1 only
// ---------------------------------------------------------------------------

test("chapter 1 from the real script either converts, or fails with the known tap-4 fallback-order error", () => {
  const scriptText = readFileSync(REAL_SCRIPT_PATH, "utf8");
  try {
    const chapter = convertChapter(scriptText, 1);
    assert.equal(chapter.id, "ch01");
    assert.equal(chapter.taps.length, 4);
    const errors = validateChapter(chapter, schema());
    assert.deepEqual(errors, []);
  } catch (err) {
    assert.ok(err instanceof ConvertError);
    assert.match(err.message, /ch01/);
    assert.match(err.message, /t4/);
    assert.match(err.message, /fallback/i);
    assert.match(err.message, /not last/);
  }
});
