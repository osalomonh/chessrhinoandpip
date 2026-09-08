// Asserts styles/tokens.css cannot silently drift from
// contracts/design-tokens.json. Every colour hex, every space step, every
// radius, every motion duration/easing and the touch/board minimums found
// in the contract must appear verbatim somewhere in the CSS custom
// properties. This is a value-presence check, not a design review — it
// cannot catch a value moved to the wrong property, only a value that has
// gone missing entirely.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensJsonPath = join(here, "..", "contracts", "design-tokens.json");
const tokensCssPath = join(here, "..", "styles", "tokens.css");

const tokensJson: unknown = JSON.parse(readFileSync(tokensJsonPath, "utf8"));
const tokensCss = readFileSync(tokensCssPath, "utf8");

// The value shapes design-tokens.json actually uses for the categories
// this eval is responsible for: colour hex, rem/px lengths, ms durations,
// and the cubic-bezier easing string. $comment/$rules/$roles prose never
// matches these shapes, so walking the whole tree and filtering is safe —
// nothing needs to know which keys are "real" tokens versus commentary.
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const REM_OR_PX_LENGTH = /^-?\d+(\.\d+)?(rem|px)$/;
const MS_DURATION = /^\d+ms$/;
const CUBIC_BEZIER = /^cubic-bezier\(.*\)$/;

function isTrackedValue(value: string): boolean {
  return (
    HEX_COLOR.test(value) ||
    REM_OR_PX_LENGTH.test(value) ||
    MS_DURATION.test(value) ||
    CUBIC_BEZIER.test(value)
  );
}

function collectTrackedValues(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    if (isTrackedValue(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectTrackedValues(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectTrackedValues(value, out);
    }
  }
}

const trackedValues = new Set<string>();
collectTrackedValues(tokensJson, trackedValues);

test("every tracked contract value is present in styles/tokens.css", () => {
  assert.ok(trackedValues.size > 0, "expected to find at least one trackable value in the contract");

  const missing = [...trackedValues].filter((value) => !tokensCss.includes(value));

  assert.deepEqual(missing, [], `values from contracts/design-tokens.json missing in styles/tokens.css: ${missing.join(", ")}`);
});

test("the contract's colour, space, radius, motion, touch and board categories all contributed at least one tracked value", () => {
  // A sanity check on the extraction itself: if design-tokens.json's shape
  // ever changes so that, say, every colour became a non-hex reference,
  // the regex-based walk above would silently track zero colours and the
  // first test would pass vacuously. Assert each category is represented.
  const tokens = tokensJson as {
    color: Record<string, unknown>;
    space: Record<string, unknown>;
    radius: Record<string, unknown>;
    motion: Record<string, unknown>;
    touch: Record<string, unknown>;
    board: Record<string, unknown>;
  };

  const colorValues = new Set<string>();
  collectTrackedValues(tokens.color, colorValues);
  assert.ok(colorValues.size >= 9, "expected all 9 colour tokens to be trackable");

  const spaceValues = new Set<string>();
  collectTrackedValues(tokens.space, spaceValues);
  assert.ok(spaceValues.size >= 8, "expected all 8 space steps to be trackable");

  const radiusValues = new Set<string>();
  collectTrackedValues(tokens.radius, radiusValues);
  assert.ok(radiusValues.size >= 4, "expected all 4 radius steps to be trackable");

  const motionValues = new Set<string>();
  collectTrackedValues(tokens.motion, motionValues);
  assert.ok(motionValues.size >= 4, "expected 3 durations plus the easing function to be trackable");

  const touchValues = new Set<string>();
  collectTrackedValues(tokens.touch, touchValues);
  assert.ok(touchValues.size >= 2, "expected both touch minimums to be trackable");

  const boardValues = new Set<string>();
  collectTrackedValues(tokens.board, boardValues);
  assert.ok(boardValues.size >= 1, "expected the board minimum to be trackable");
});
