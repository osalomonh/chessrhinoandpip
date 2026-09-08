// Script-to-JSON converter for the Rhino and Pip story pack.
//
// Reads stories/rhino-and-pip/scripts/series-1.txt, emits one JSON file per
// chapter into stories/rhino-and-pip/chapters/, and regenerates
// stories/rhino-and-pip/pack.json from the art actually present on disk.
//
// It fails loudly rather than guess. See contracts/chapter-format.md,
// contracts/story-pack.md, contracts/classifiers.json and
// contracts/activity.md for the rules this file implements.
//
// Usage:
//   tsx tools/convert.ts --chapter ch01
//   tsx tools/convert.ts --chapter 1
//   tsx tools/convert.ts --chapter 1,2,3
//   tsx tools/convert.ts --chapter 1-16          (stops at first failure)
//   tsx tools/convert.ts                          (all 16, stops at first failure)
//   tsx tools/convert.ts --schema path/to/other-schema.json
//   tsx tools/convert.ts --script path/to/script.txt --out path/to/chapters

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate, type JsonSchema } from "./schema-validate.js";
import classifiersJson from "../contracts/classifiers.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Speaker = "pip" | "rhino";

export type LineObj =
  | { pip: string }
  | { rhino: string }
  | { stage: string; pose?: Record<string, string> }
  | { pause: number };

export type Target =
  | { kind: "square"; square: string }
  | { kind: "colour"; colour: "light" | "dark" }
  | { kind: "adjacent"; to: string; direction: "orthogonal" | "any"; sameColour?: boolean }
  | { kind: "relation"; shape?: string; distance?: number }
  | { kind: "blocked"; line?: string }
  | { kind: "piece"; piece: string }
  | { kind: "offBoard" }
  | { kind: "choice"; option: string }
  | { kind: "fallback" };

export type WrongEntry = { match?: Target; lines: LineObj[] };

export type Tap = {
  id: string;
  prompt: string;
  lead: LineObj[];
  target: Target;
  right: LineObj[];
  wrong: WrongEntry[];
  plain: LineObj[];
  show: LineObj[];
};

export type Chapter = {
  id: string;
  order: number;
  title: string;
  holds: string;
  board: { size: number; pieces: unknown[] };
  characters: { pip: { at: string }; rhino: { at: string } };
  open: LineObj[];
  taps: Tap[];
  celebration: { name: string; media: string; script: LineObj[] };
};

/** Raised for every failure the converter is required to fail loudly on.
 * Always carries a human-readable message naming the chapter and, where
 * applicable, the tap/label/line responsible. */
export class ConvertError extends Error {}

// ---------------------------------------------------------------------------
// Classifier labels (contracts/classifiers.json)
// ---------------------------------------------------------------------------

type ClassifierValue = Record<string, unknown>;

const CLASSIFIERS = classifiersJson as unknown as {
  labels: Record<string, ClassifierValue>;
  unresolved: Record<string, string[]>;
};

/** Curly apostrophes/quotes and en/em dashes vary between the script and
 * classifiers.json. Normalised for LOOKUP ONLY — never for the text that
 * ends up in emitted JSON, which must be byte-identical to the script. */
function normaliseForLookup(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function findUnresolvedCapability(label: string): string | undefined {
  const norm = normaliseForLookup(label);
  for (const [capability, labels] of Object.entries(CLASSIFIERS.unresolved)) {
    if (capability.startsWith("$")) continue;
    if (labels.some((l) => normaliseForLookup(l) === norm)) return capability;
  }
  return undefined;
}

function lookupClassifierLabel(chapterId: string, tapId: string, label: string): ClassifierValue {
  const norm = normaliseForLookup(label);
  for (const [key, value] of Object.entries(CLASSIFIERS.labels)) {
    if (key.startsWith("$comment")) continue;
    if (normaliseForLookup(key) === norm) return value;
  }
  const capability = findUnresolvedCapability(label);
  if (capability) {
    throw new ConvertError(
      `${chapterId} ${tapId}: wrong-entry label "${label}" needs a capability that does not exist yet (${capability}). ` +
        `This chapter cannot convert until it does.`,
    );
  }
  throw new ConvertError(
    `${chapterId} ${tapId}: wrong-entry label "${label}" is not in contracts/classifiers.json.`,
  );
}

/** Resolves $rhino / $origin / $queenHome placeholders inside a classifier
 * value. $origin and $queenHome are not needed by chapter 1; if a future
 * chapter reaches them, this fails loudly naming what is missing rather than
 * guessing. */
function resolvePlaceholders(
  value: ClassifierValue,
  chapterId: string,
  tapId: string,
  ctx: { rhinoSquare: string },
): Target {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === "$rhino") {
      resolved[k] = ctx.rhinoSquare;
    } else if (v === "$origin") {
      throw new ConvertError(
        `${chapterId} ${tapId}: label resolves to $origin, which chapter 1 has no resolution for (no piece is being moved and no origin character is named). Cannot convert.`,
      );
    } else if (v === "$queenHome") {
      throw new ConvertError(
        `${chapterId} ${tapId}: label resolves to $queenHome, which is not needed for chapter 1 and has no resolution here. Cannot convert.`,
      );
    } else {
      resolved[k] = v;
    }
  }
  return resolved as unknown as Target;
}

// ---------------------------------------------------------------------------
// Prompt -> target table (converter code, not a contract)
// ---------------------------------------------------------------------------

const PROMPT_TARGETS: Record<string, Target> = {
  "Tap the light corner.": { kind: "square", square: "h1" },
  "Tap a light square.": { kind: "colour", colour: "light" },
  "Tap a dark square.": { kind: "colour", colour: "dark" },
  "Tap the square next to Rhino’s foot. Other colour.": {
    kind: "adjacent",
    to: "rhino",
    direction: "orthogonal",
  },
};

function resolvePromptTarget(chapterId: string, tapId: string, prompt: string): Target {
  const target = PROMPT_TARGETS[prompt];
  if (!target) {
    throw new ConvertError(
      `${chapterId} ${tapId}: no target resolution for prompt "${prompt}". Add it to the prompt table in tools/convert.ts if it is genuinely new, or check the script for a typo.`,
    );
  }
  // Return a copy; targets are small enough this is cheap and it prevents
  // accidental cross-tap mutation.
  return JSON.parse(JSON.stringify(target));
}

// ---------------------------------------------------------------------------
// Corner map
// ---------------------------------------------------------------------------

const CORNERS: Record<string, string> = {
  "near-left": "a1",
  "near-right": "h1",
  "far-left": "a8",
  "far-right": "h8",
};

// ---------------------------------------------------------------------------
// Line-level parsing
// ---------------------------------------------------------------------------

const SPEAKER_LINE = /^(Pip|Rhino):\s*(.*)$/;
const SPEAKER_PREFIX = /^(Pip|Rhino):/;

function hasLeadingWhitespace(line: string): boolean {
  return /^\s/.test(line);
}

/** A single leading pose tag: "[pip:sitting]", "[rhino:step]". Speaker and
 * pose are required to be lowercase word characters — anything else in
 * leading brackets is malformed and must fail loudly rather than be
 * silently absorbed into the prose. */
const POSE_TAG = /^\[([a-z][a-z0-9_]*):([a-z][a-z0-9_]*)\]/;
/** Any leading bracket group at all, valid or not — used to detect and
 * report a malformed tag once POSE_TAG has failed to match it. */
const LEADING_BRACKET = /^\[[^\]]*\]/;

/** Strips zero or more leading "[speaker:pose]" tags from a stage line, per
 * contracts/chapter-format.md's "Pose annotation in the source". A single
 * line may name both speakers: "[pip:sitting] [rhino:step] ...". Returns the
 * accumulated pose map (undefined if no tag was present) and the prose with
 * the tag(s) stripped.
 *
 * Fails loudly (naming chapter/tap/line) on:
 *   - a speaker key in a tag that isn't a known speaker ("pip" | "rhino")
 *   - a leading `[...]` that isn't a well-formed "key:pose" tag
 */
function extractPoseTags(
  line: string,
  chapterId: string,
  tapId: string,
): { pose?: Record<string, string>; rest: string } {
  let rest = line;
  let pose: Record<string, string> | undefined;
  for (;;) {
    const stripped = rest.replace(/^\s+/, "");
    const tagMatch = POSE_TAG.exec(stripped);
    if (tagMatch) {
      const speaker = tagMatch[1]!;
      const poseName = tagMatch[2]!;
      if (speaker !== "pip" && speaker !== "rhino") {
        throw new ConvertError(
          `${chapterId} ${tapId}: pose tag "${tagMatch[0]}" names an unknown speaker "${speaker}" (expected "pip" or "rhino").`,
        );
      }
      pose ??= {};
      pose[speaker] = poseName;
      rest = stripped.slice(tagMatch[0].length);
      continue;
    }
    const badBracket = LEADING_BRACKET.exec(stripped);
    if (badBracket) {
      throw new ConvertError(
        `${chapterId} ${tapId}: malformed pose tag "${badBracket[0]}" in stage line — expected "[speaker:pose]" with lowercase speaker and pose (e.g. "[pip:sitting]"). Line: "${line}"`,
      );
    }
    rest = stripped;
    break;
  }
  return { pose, rest };
}

/** Parses a block of raw script lines (blank lines allowed, will be
 * skipped) into line objects, per the rules worked out from the contract's
 * example and the actual script:
 *
 * - A line whose trimmed text starts with "Pip:" or "Rhino:" starts a new
 *   dialogue line. Indented lines immediately following it that do NOT
 *   themselves start with a speaker prefix are continuations, joined with a
 *   single space (this is how the script wraps a long line of dialogue).
 * - Any other non-blank line starts a stage/prose paragraph. Every
 *   contiguous non-blank line after it that has no speaker prefix joins the
 *   same paragraph, joined with a single space. A stage paragraph's first
 *   line may carry one or more leading "[speaker:pose]" tags (see
 *   contracts/chapter-format.md, "Pose annotation in the source"); they are
 *   stripped from the prose and drive a `pose` field on the emitted line.
 *
 * `location` names the chapter/tap a pose-tag error should be reported
 * against. It defaults to placeholders for callers (tests, mostly) that
 * don't have a real chapter/tap to report and don't exercise pose tags.
 */
export function parseLines(
  rawLines: string[],
  location: { chapterId: string; tapId: string } = { chapterId: "?", tapId: "?" },
): LineObj[] {
  const result: LineObj[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const trimmed = line.trim();
    const speakerMatch = SPEAKER_LINE.exec(trimmed);
    if (speakerMatch) {
      const speaker = speakerMatch[1]!.toLowerCase() as Speaker;
      let text = speakerMatch[2]!.trim();
      let j = i + 1;
      while (j < rawLines.length) {
        const next = rawLines[j]!;
        if (next.trim() === "") break;
        if (!hasLeadingWhitespace(next)) break;
        const nextTrimmed = next.trim();
        if (SPEAKER_PREFIX.test(nextTrimmed)) break;
        text += " " + nextTrimmed;
        j++;
      }
      result.push(speaker === "pip" ? { pip: text } : { rhino: text });
      i = j;
    } else {
      const { pose, rest } = extractPoseTags(trimmed, location.chapterId, location.tapId);
      const texts = [rest];
      let j = i + 1;
      while (j < rawLines.length) {
        const next = rawLines[j]!;
        if (next.trim() === "") break;
        const nextTrimmed = next.trim();
        if (SPEAKER_PREFIX.test(nextTrimmed)) break;
        texts.push(nextTrimmed);
        j++;
      }
      const stageText = texts.filter((t) => t.length > 0).join(" ");
      result.push(pose ? { stage: stageText, pose } : { stage: stageText });
      i = j;
    }
  }
  return result;
}

/** True if `line` is a flush-left (no leading whitespace) label header:
 * text ending in ':' that is not itself a dialogue line. Used to delimit
 * classified WRONG entries and to reject anything else in that block. */
function isLabelHeader(line: string): boolean {
  if (hasLeadingWhitespace(line)) return false;
  const trimmed = line.trim();
  if (trimmed === "") return false;
  if (SPEAKER_PREFIX.test(trimmed)) return false;
  return trimmed.endsWith(":");
}

function parseClassifiedWrong(chapterId: string, tapId: string, rawLines: string[]): Array<{ label: string; lines: LineObj[] }> {
  const entries: Array<{ label: string; lines: LineObj[] }> = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (!isLabelHeader(line)) {
      throw new ConvertError(
        `${chapterId} ${tapId}: expected a classified WRONG label (flush left, ending ":") but found "${line.trim()}".`,
      );
    }
    const label = line.trim().slice(0, -1).trim();
    const body: string[] = [];
    let j = i + 1;
    while (j < rawLines.length) {
      const next = rawLines[j]!;
      if (next.trim() === "") break;
      if (isLabelHeader(next)) break;
      body.push(next);
      j++;
    }
    if (body.length === 0) {
      throw new ConvertError(`${chapterId} ${tapId}: classified WRONG label "${label}" has no lines.`);
    }
    entries.push({ label, lines: parseLines(body, { chapterId, tapId }) });
    i = j;
  }
  return entries;
}

const NUMBERED_ENTRY = /^\d+\s+(.*)$/;

function parseNumberedWrong(chapterId: string, tapId: string, rawLines: string[]): Array<{ lines: LineObj[] }> {
  const entries: Array<{ lines: LineObj[] }> = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const m = !hasLeadingWhitespace(line) ? NUMBERED_ENTRY.exec(line) : null;
    if (!m) {
      throw new ConvertError(
        `${chapterId} ${tapId}: expected a numbered WRONG entry ("1  Speaker: ...") but found "${line.trim()}".`,
      );
    }
    const body: string[] = [m[1]!];
    let j = i + 1;
    while (j < rawLines.length) {
      const next = rawLines[j]!;
      if (next.trim() === "") break;
      if (!hasLeadingWhitespace(next) && NUMBERED_ENTRY.test(next)) break;
      body.push(next);
      j++;
    }
    entries.push({ lines: parseLines(body, { chapterId, tapId }) });
    i = j;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Voice checks (mechanical, per story-pack.md)
// ---------------------------------------------------------------------------

function lineText(line: LineObj): string | undefined {
  if ("pip" in line) return line.pip;
  if ("rhino" in line) return line.rhino;
  if ("stage" in line) return line.stage;
  return undefined;
}

function checkNoExclamations(chapterId: string, tapId: string, tier: string, lines: LineObj[]): void {
  for (const line of lines) {
    const text = lineText(line);
    if (text && text.includes("!")) {
      throw new ConvertError(
        `${chapterId} ${tapId} [${tier}]: exclamation mark outside a celebration script: "${text}"`,
      );
    }
  }
}

/** Poses actually present on disk for a speaker, read once per speaker and
 * cached. Used only to WARN (never fail) when a stage direction's pose tag
 * names art that doesn't exist — contracts/story-pack.md is explicit that a
 * missing pose falls back to `idle` and "logs nothing" at runtime, but the
 * converter still surfaces it so a human can see the content gap. */
const poseFileCache = new Map<string, Set<string>>();
function availablePoses(speaker: string): Set<string> {
  const cached = poseFileCache.get(speaker);
  if (cached) return cached;
  const dir = join(packRoot(), "speakers", speaker);
  const poses = existsSync(dir)
    ? new Set(
        readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(".png"))
          .map((f) => f.slice(0, -".png".length)),
      )
    : new Set<string>();
  poseFileCache.set(speaker, poses);
  return poses;
}

/** Warns to stderr (does not throw) for every pose tag whose named pose has
 * no matching PNG for that speaker. Format:
 *   convert: WARNING <chapter> <tap> [<tier>]: pose "<speaker>:<pose>" has
 *   no PNG at stories/rhino-and-pip/speakers/<speaker>/<pose>.png — falls
 *   back to idle.
 */
function checkPoseArt(chapterId: string, tapId: string, tier: string, lines: LineObj[]): void {
  for (const line of lines) {
    if (!("stage" in line) || !line.pose) continue;
    for (const [speaker, poseName] of Object.entries(line.pose)) {
      if (!availablePoses(speaker).has(poseName)) {
        console.warn(
          `convert: WARNING ${chapterId} ${tapId} [${tier}]: pose "${speaker}:${poseName}" has no PNG at ` +
            `stories/rhino-and-pip/speakers/${speaker}/${poseName}.png — falls back to idle.`,
        );
      }
    }
  }
}

/** Heuristic for "no second-person address to the child inside wrong
 * responses" (story-pack.md). A bare grep for you/your would misfire twice
 * over on real script content:
 *
 *   - The contract's own worked example, "They tapped yours. Yours is
 *     dark.", contains "yours", which is a different word from "you"/"your"
 *     (a word-boundary regex on "you"/"your" correctly does not match inside
 *     "yours" — there is no boundary between the "u" and the "r").
 *   - Chapter 1 tap 4 has Pip say "I tapped you." to Rhino — "you" here is
 *     the *object* of the sentence, referring to a character, not the
 *     child. This is ordinary inter-character dialogue, not a break of
 *     voice.
 *
 * What we actually want to catch is the child being told, in the second
 * person, what THEY did or should do — i.e. "you" as the *subject* of a
 * tap/choice verb ("You tapped the dark one."), or an imperative aimed at
 * the child ("Try again."). So the check is:
 *
 *   - /\byou\s+(tap|tapped|taps|choose|chose|pick|picked)\b/i — "you" is
 *     immediately followed by a tapping/choosing verb, i.e. "you" is the
 *     grammatical subject describing the child's own action.
 *   - /\btry again\b/i — a direct imperative to the child.
 *
 * Known limitation: this cannot catch second-person address phrased another
 * way (e.g. a hypothetical "You are wrong." has no tap verb and no "try
 * again", so it would slip through). It is a mechanical heuristic, not full
 * language understanding, and is documented here rather than invented
 * silently.
 */
const SECOND_PERSON_SUBJECT_OF_TAP = /\byou\s+(tap|tapped|taps|choose|chose|pick|picked)\b/i;
const IMPERATIVE_TRY_AGAIN = /\btry again\b/i;

function checkNoSecondPerson(chapterId: string, tapId: string, wrong: WrongEntry[]): void {
  for (const entry of wrong) {
    for (const line of entry.lines) {
      const text = lineText(line);
      if (!text) continue;
      if (SECOND_PERSON_SUBJECT_OF_TAP.test(text) || IMPERATIVE_TRY_AGAIN.test(text)) {
        throw new ConvertError(
          `${chapterId} ${tapId}: wrong-tier line addresses the child in second person: "${text}"`,
        );
      }
    }
  }
}

function checkShow(chapterId: string, tapId: string, showHeader: string, show: LineObj[]): void {
  const m = /(Pip|Rhino)\s+finds it\./.exec(showHeader);
  if (!m) {
    throw new ConvertError(
      `${chapterId} ${tapId}: SHOW header "${showHeader}" does not name who errs ("<Name> finds it."). Cannot determine the non-erring speaker.`,
    );
  }
  const erring = m[1]!.toLowerCase() as Speaker;
  const nonErring: Speaker = erring === "pip" ? "rhino" : "pip";
  const said = show.some((line) => {
    if (nonErring === "pip" && "pip" in line) return line.pip === "That is the one.";
    if (nonErring === "rhino" && "rhino" in line) return line.rhino === "That is the one.";
    return false;
  });
  if (!said) {
    throw new ConvertError(
      `${chapterId} ${tapId}: SHOW must contain the exact line "That is the one." spoken by ${nonErring} (the non-erring speaker per "${showHeader}").`,
    );
  }
}

// ---------------------------------------------------------------------------
// Script splitting
// ---------------------------------------------------------------------------

const CHAPTER_HEADER = /^CHAPTER\s+(\d+)\s+—\s+(.+)$/;
const QUIETLY_HOLDING = /^Quietly holding:\s*(.*)$/;
const OPEN_MARKER = /^OPEN\s*$/;
const TAP_MARKER = /^TAP\s+(\d+)\s+—\s+(.+)$/;
const RIGHT_MARKER = /^RIGHT\s*$/;
const WRONG_MARKER = /^WRONG\s+—\s+(.+)$/;
const PLAIN_MARKER = /^PLAIN LINE\s*$/;
const SHOW_MARKER = /^SHOW\s+—\s+(.+)$/;
const CELEBRATION_MARKER = /^CELEBRATION\s+—\s+(.+)$/;

type ChapterBlock = { number: number; title: string; start: number; end: number };

function splitIntoChapterBlocks(lines: string[]): ChapterBlock[] {
  const headers: { index: number; number: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const m = CHAPTER_HEADER.exec(line);
    if (m) headers.push({ index: i, number: Number(m[1]), title: m[2]!.trim() });
  });
  return headers.map((h, i) => ({
    number: h.number,
    title: h.title,
    start: h.index,
    end: headers[i + 1]?.index ?? lines.length,
  }));
}

function findLine(lines: string[], regex: RegExp, from: number, to: number): { index: number; match: RegExpExecArray } | undefined {
  for (let i = from; i < to; i++) {
    const m = regex.exec(lines[i]!);
    if (m) return { index: i, match: m };
  }
  return undefined;
}

/** A line that is nothing but "=" characters — the box-drawing border around
 * "CHAPTER n — TITLE" headers. These can end up at the tail of the last
 * section in a chapter (the celebration), immediately before the next
 * chapter's opening border, and are not part of any script content. */
function isBorderLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && /^=+$/.test(t);
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  const skippable = (l: string) => l.trim() === "" || isBorderLine(l);
  while (start < end && skippable(lines[start]!)) start++;
  while (end > start && skippable(lines[end - 1]!)) end--;
  return lines.slice(start, end);
}

// ---------------------------------------------------------------------------
// Chapter conversion
// ---------------------------------------------------------------------------

function chapterId(n: number): string {
  return `ch${String(n).padStart(2, "0")}`;
}

/** True if `match` is a colour-kind target for the given colour. Written as
 * a plain narrowing check on a local variable (rather than optional-chained
 * property access at the call site) so TypeScript's discriminated-union
 * narrowing on `Target["kind"]` applies without a cast: narrowing works on
 * `match.kind === "colour"` for a variable of type `Target | undefined`, but
 * does not survive being re-derived through `w.match?.kind` at each call
 * site. */
function matchIsColour(match: Target | undefined, colour: "light" | "dark"): boolean {
  return match !== undefined && match.kind === "colour" && match.colour === colour;
}

export function convertChapter(scriptText: string, chapterNumber: number): Chapter {
  const lines = scriptText.split(/\r\n|\r|\n/);
  const blocks = splitIntoChapterBlocks(lines);
  const block = blocks.find((b) => b.number === chapterNumber);
  if (!block) {
    throw new ConvertError(`Chapter ${chapterNumber}: no "CHAPTER ${chapterNumber} — ..." header found in script.`);
  }
  const id = chapterId(chapterNumber);
  const { start, end } = block;

  const holdsLine = findLine(lines, QUIETLY_HOLDING, start, end);
  if (!holdsLine) throw new ConvertError(`${id}: no "Quietly holding:" line found.`);
  const holds = holdsLine.match[1]!.trim();

  const openMarker = findLine(lines, OPEN_MARKER, start, end);
  if (!openMarker) throw new ConvertError(`${id}: no "OPEN" section found.`);

  const tapMarkers: { index: number; number: number; prompt: string }[] = [];
  for (let i = openMarker.index + 1; i < end; i++) {
    const m = TAP_MARKER.exec(lines[i]!);
    if (m) tapMarkers.push({ index: i, number: Number(m[1]), prompt: m[2]!.trim() });
  }
  if (tapMarkers.length === 0) throw new ConvertError(`${id}: no "TAP n — ..." sections found.`);

  const celebrationMarker = findLine(lines, CELEBRATION_MARKER, tapMarkers[tapMarkers.length - 1]!.index, end);
  if (!celebrationMarker) throw new ConvertError(`${id}: no "CELEBRATION — ..." section found.`);

  // --- OPEN ---
  const openRaw = trimBlank(lines.slice(openMarker.index + 1, tapMarkers[0]!.index));
  const openText = openRaw.join("\n");

  const characters: { pip?: { at: string }; rhino?: { at: string } } = {};
  for (const m of openText.matchAll(/(Pip|Rhino) stands on the (near-left|near-right|far-left|far-right) corner\./g)) {
    const speaker = m[1]!.toLowerCase() as Speaker;
    const corner = m[2]! as keyof typeof CORNERS;
    characters[speaker] = { at: CORNERS[corner]! };
  }
  if (!characters.pip || !characters.rhino) {
    throw new ConvertError(
      `${id}: OPEN does not place both speakers on a corner ("<Name> stands on the <corner> corner."). Found: ${JSON.stringify(characters)}`,
    );
  }

  const strippedForPieceCheck = openText.replace(/No pieces\.?/gi, "");
  if (/\bpiece(s)?\b/i.test(strippedForPieceCheck)) {
    throw new ConvertError(
      `${id}: OPEN mentions pieces beyond "No pieces." — boards with pieces are not supported by this converter yet.`,
    );
  }

  const open = parseLines(openRaw, { chapterId: id, tapId: "open" });
  checkNoExclamations(id, "open", "open", open);
  checkPoseArt(id, "open", "open", open);

  // --- TAPS ---
  const taps: Tap[] = [];
  for (let t = 0; t < tapMarkers.length; t++) {
    const marker = tapMarkers[t]!;
    const tapId = `t${marker.number}`;
    const tapEnd = tapMarkers[t + 1]?.index ?? celebrationMarker.index;
    const tapLines = lines.slice(marker.index + 1, tapEnd);
    // Indices below are relative to tapLines.
    const rightRel = findLine(tapLines, RIGHT_MARKER, 0, tapLines.length);
    if (!rightRel) throw new ConvertError(`${id} ${tapId}: missing RIGHT tier.`);
    const wrongRel = findLine(tapLines, WRONG_MARKER, rightRel.index, tapLines.length);
    if (!wrongRel) throw new ConvertError(`${id} ${tapId}: missing WRONG tier.`);
    const plainRel = findLine(tapLines, PLAIN_MARKER, wrongRel.index, tapLines.length);
    if (!plainRel) throw new ConvertError(`${id} ${tapId}: missing PLAIN tier.`);
    const showRel = findLine(tapLines, SHOW_MARKER, plainRel.index, tapLines.length);
    if (!showRel) throw new ConvertError(`${id} ${tapId}: missing SHOW tier.`);

    const leadRaw = trimBlank(tapLines.slice(0, rightRel.index));
    const rightRaw = trimBlank(tapLines.slice(rightRel.index + 1, wrongRel.index));
    const wrongRaw = trimBlank(tapLines.slice(wrongRel.index + 1, plainRel.index));
    const plainRaw = trimBlank(tapLines.slice(plainRel.index + 1, showRel.index));
    const showRaw = trimBlank(tapLines.slice(showRel.index + 1, tapLines.length));

    if (rightRaw.length === 0) throw new ConvertError(`${id} ${tapId}: RIGHT tier has no lines.`);
    if (plainRaw.length === 0) throw new ConvertError(`${id} ${tapId}: PLAIN tier has no lines.`);
    if (showRaw.length === 0) throw new ConvertError(`${id} ${tapId}: SHOW tier has no lines.`);

    const loc = { chapterId: id, tapId };
    const lead = parseLines(leadRaw, loc);
    const right = parseLines(rightRaw, loc);
    const plain = parseLines(plainRaw, loc);
    const show = parseLines(showRaw, loc);

    checkNoExclamations(id, tapId, "lead", lead);
    checkNoExclamations(id, tapId, "right", right);
    checkNoExclamations(id, tapId, "plain", plain);
    checkNoExclamations(id, tapId, "show", show);
    checkPoseArt(id, tapId, "lead", lead);
    checkPoseArt(id, tapId, "right", right);
    checkPoseArt(id, tapId, "plain", plain);
    checkPoseArt(id, tapId, "show", show);
    checkShow(id, tapId, wrongRel && showRel ? tapLines[showRel.index]!.trim() : "", show);

    const wrongHeaderText = tapLines[wrongRel.index]!.trim();
    const wrongHeaderMatch = WRONG_MARKER.exec(wrongHeaderText)!;
    const wrongHeaderBody = wrongHeaderMatch[1]!;
    let wrong: WrongEntry[];
    const rhinoSquare = characters.rhino!.at;
    if (wrongHeaderBody.startsWith("classified")) {
      const parsed = parseClassifiedWrong(id, tapId, wrongRaw);
      wrong = parsed.map(({ label, lines: entryLines }) => {
        const classifierValue = lookupClassifierLabel(id, tapId, label);
        const match = resolvePlaceholders(classifierValue, id, tapId, { rhinoSquare });
        checkNoExclamations(id, tapId, `wrong[${label}]`, entryLines);
        checkPoseArt(id, tapId, `wrong[${label}]`, entryLines);
        return { match, lines: entryLines };
      });
    } else if (wrongHeaderBody.startsWith("one miss type")) {
      const parsed = parseNumberedWrong(id, tapId, wrongRaw);
      wrong = parsed.map(({ lines: entryLines }, idx) => {
        checkNoExclamations(id, tapId, `wrong[${idx + 1}]`, entryLines);
        checkPoseArt(id, tapId, `wrong[${idx + 1}]`, entryLines);
        return { lines: entryLines };
      });
    } else {
      throw new ConvertError(
        `${id} ${tapId}: unrecognised WRONG header "${wrongHeaderText}" (expected "classified..." or "one miss type...").`,
      );
    }

    // fallback must be last; a tap with no random pool must have full
    // coverage (chapter 1's own bar: colour:light + colour:dark, or an
    // explicit fallback in last place).
    const fallbackIndices = wrong
      .map((w, i) => (w.match?.kind === "fallback" ? i : -1))
      .filter((i) => i >= 0);
    for (const fi of fallbackIndices) {
      if (fi !== wrong.length - 1) {
        throw new ConvertError(
          `${id} ${tapId}: a "fallback"-kind wrong entry is not last (position ${fi + 1} of ${wrong.length}). ` +
            `contracts/chapter-format.md requires fallback to be the last entry in a tap; the script orders this ` +
            `classified WRONG block with a fallback-labelled entry before other classified entries. The script is ` +
            `not being reordered to fix this — the converter rejects the tap as written.`,
        );
      }
    }
    const hasRandomPool = wrong.some((w) => w.match === undefined);
    const hasFallback = fallbackIndices.length > 0;
    if (!hasRandomPool && !hasFallback) {
      const kinds = wrong.map((w) => w.match?.kind);
      const coversBothColours =
        wrong.some((w) => matchIsColour(w.match, "light")) &&
        wrong.some((w) => matchIsColour(w.match, "dark"));
      if (!coversBothColours) {
        throw new ConvertError(
          `${id} ${tapId}: no random pool and no fallback entry, and the classified entries (${kinds.join(", ")}) ` +
            `do not visibly cover every reachable wrong square (expected colour:light + colour:dark coverage for a ` +
            `fully-classified tap, per contracts/chapter-format.md's "Classified versus random" section).`,
        );
      }
    }

    checkNoSecondPerson(id, tapId, wrong);

    const prompt = marker.prompt;
    const target = resolvePromptTarget(id, tapId, prompt);

    taps.push({ id: tapId, prompt, lead, target, right, wrong, plain, show });
  }

  // --- CELEBRATION ---
  const celebrationName = celebrationMarker.match[1]!.trim();
  const celebrationRaw = trimBlank(lines.slice(celebrationMarker.index + 1, end));
  const script = parseLines(celebrationRaw, { chapterId: id, tapId: "celebration" });
  // Exclamation marks ARE allowed in celebrations, so no check here.
  checkPoseArt(id, "celebration", "celebration", script);

  const celebrationsDir = resolve(packRoot(), "celebrations");
  let media: string | undefined;
  if (existsSync(celebrationsDir)) {
    const candidates = readdirSync(celebrationsDir).filter((f) => f.startsWith(`${id}_`));
    if (candidates.length === 0) {
      throw new ConvertError(`${id}: no celebration file found in stories/rhino-and-pip/celebrations/ starting with "${id}_".`);
    }
    if (candidates.length > 1) {
      throw new ConvertError(
        `${id}: multiple celebration files start with "${id}_" (${candidates.join(", ")}); expected exactly one.`,
      );
    }
    media = `celebrations/${candidates[0]}`;
  } else {
    throw new ConvertError(`${id}: celebrations folder stories/rhino-and-pip/celebrations/ does not exist.`);
  }

  return {
    id,
    order: chapterNumber,
    title: block.title,
    holds,
    board: { size: 8, pieces: [] },
    characters: { pip: characters.pip!, rhino: characters.rhino! },
    open,
    taps,
    celebration: { name: celebrationName, media, script },
  };
}

// ---------------------------------------------------------------------------
// Filesystem roots
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

function packRoot(): string {
  return join(REPO_ROOT, "stories", "rhino-and-pip");
}

// ---------------------------------------------------------------------------
// pack.json generation
// ---------------------------------------------------------------------------

const ALL_CHAPTER_IDS = Array.from({ length: 16 }, (_, i) => chapterId(i + 1));

export function buildPackJson(): {
  id: string;
  title: string;
  series: number;
  speakers: Record<string, { name: string; poses: string[] }>;
  chapters: string[];
  celebrations: Record<string, string>;
} {
  const speakersDir = join(packRoot(), "speakers");
  const speakerDisplayNames: Record<string, string> = { pip: "Pip", rhino: "Rhino" };
  const speakers: Record<string, { name: string; poses: string[] }> = {};
  for (const key of readdirSync(speakersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()) {
    const dir = join(speakersDir, key);
    const poses = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .map((f) => f.slice(0, -".png".length))
      .sort();
    if (!poses.includes("idle")) {
      throw new ConvertError(`pack.json: speaker "${key}" has no idle.png in stories/rhino-and-pip/speakers/${key}/.`);
    }
    speakers[key] = { name: speakerDisplayNames[key] ?? key, poses };
  }

  const celebrationsDir = join(packRoot(), "celebrations");
  const celebrations: Record<string, string> = {};
  if (existsSync(celebrationsDir)) {
    for (const file of readdirSync(celebrationsDir)) {
      const m = /^(ch\d{2})_/.exec(file);
      if (m) celebrations[m[1]!] = `celebrations/${file}`;
    }
  }

  return {
    id: "rhino-and-pip",
    title: "Rhino and Pip",
    series: 1,
    speakers,
    chapters: ALL_CHAPTER_IDS,
    celebrations,
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export function validateChapter(chapter: Chapter, schema: JsonSchema): string[] {
  return validate(schema, chapter as unknown);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseChapterSelector(selector: string | undefined): number[] {
  if (!selector) return Array.from({ length: 16 }, (_, i) => i + 1);
  const parts = selector.split(",").map((p) => p.trim());
  const numbers: number[] = [];
  for (const part of parts) {
    const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      for (let n = lo; n <= hi; n++) numbers.push(n);
      continue;
    }
    const chMatch = /^ch(\d+)$/.exec(part);
    if (chMatch) {
      numbers.push(Number(chMatch[1]));
      continue;
    }
    if (/^\d+$/.test(part)) {
      numbers.push(Number(part));
      continue;
    }
    throw new ConvertError(`--chapter: could not parse selector segment "${part}".`);
  }
  return numbers;
}

function parseArgs(argv: string[]): {
  chapter?: string;
  schema: string;
  script: string;
  out: string;
} {
  let chapter: string | undefined;
  let schema = "contracts/chapter-format.schema.json";
  let script = join("stories", "rhino-and-pip", "scripts", "series-1.txt");
  let out = join("stories", "rhino-and-pip", "chapters");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--chapter" || arg === "--chapters") {
      chapter = argv[++i];
    } else if (arg === "--schema") {
      schema = argv[++i]!;
    } else if (arg === "--script") {
      script = argv[++i]!;
    } else if (arg === "--out") {
      out = argv[++i]!;
    }
  }
  return { chapter, schema, script, out };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const schemaPath = resolve(REPO_ROOT, args.schema);
  if (!existsSync(schemaPath)) {
    console.error(
      `convert: schema file not found at ${relative(REPO_ROOT, schemaPath)}. ` +
        `Pass --schema <path> to override, or add contracts/chapter-format.schema.json.`,
    );
    process.exit(1);
  }
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as JsonSchema;

  const scriptPath = resolve(REPO_ROOT, args.script);
  if (!existsSync(scriptPath)) {
    console.error(`convert: script file not found at ${relative(REPO_ROOT, scriptPath)}.`);
    process.exit(1);
  }
  const scriptText = readFileSync(scriptPath, "utf8");

  const outDir = resolve(REPO_ROOT, args.out);
  mkdirSync(outDir, { recursive: true });

  // pack.json is regenerated unconditionally: it reflects the art and GIFs
  // actually present on disk plus the fixed 16-chapter path order, none of
  // which depends on whether a given chapter's script currently converts.
  const pack = buildPackJson();
  const packPath = join(packRoot(), "pack.json");
  writeFileSync(packPath, JSON.stringify(pack, null, 2) + "\n", "utf8");
  console.log(`convert: wrote ${relative(REPO_ROOT, packPath)}`);

  const chapterNumbers = parseChapterSelector(args.chapter);

  for (const n of chapterNumbers) {
    const id = chapterId(n);
    let chapter: Chapter;
    try {
      chapter = convertChapter(scriptText, n);
    } catch (err) {
      console.error(`convert: ${id}: ${(err as Error).message}`);
      process.exit(1);
    }
    const errors = validateChapter(chapter, schema);
    if (errors.length > 0) {
      console.error(`convert: ${id} failed schema validation:`);
      for (const e of errors) console.error(`  ${e}`);
      process.exit(1);
    }
    const outPath = join(outDir, `${id}.json`);
    writeFileSync(outPath, JSON.stringify(chapter, null, 2) + "\n", "utf8");
    console.log(`convert: wrote ${relative(REPO_ROOT, outPath)}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
