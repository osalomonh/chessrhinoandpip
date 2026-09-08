// Turns unknown JSON into a typed Chapter, and a raw line object into a
// ParsedLine the engine can act on. This is a runtime validator, not a
// schema check — the converter (tools/) already validates chapter JSON
// against the schema at build time. This exists so activity/ never has to
// reach for `as` past an unchecked value.

import type { Chapter, RawLine, Tap, Target, WrongEntry } from "./types.js";
import { FormatError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isRawLine(value: unknown): value is RawLine {
  return isRecord(value);
}

function expectArrayOfLines(value: unknown, path: string): RawLine[] {
  if (!Array.isArray(value)) throw new FormatError(`${path} must be an array`);
  return value.map((item, i) => {
    if (!isRawLine(item)) throw new FormatError(`${path}[${i}] must be a line object`);
    return item;
  });
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type ParsedLine =
  | { kind: "speaker"; speaker: string; text: string }
  | { kind: "stage"; text: string; pose: Record<string, string> }
  | { kind: "pause"; ms: number };

/** Classifies a raw line object into speaker / stage / pause. A `stage` key
 * wins over a `pause` key, which wins over treating the object as a single
 * speaker line — matching the shapes in contracts/chapter-format.md. */
export function parseLine(raw: RawLine): ParsedLine {
  const stage = raw["stage"];
  if (isString(stage)) {
    const poseRaw = raw["pose"];
    const pose: Record<string, string> = {};
    if (poseRaw !== undefined) {
      if (!isRecord(poseRaw)) {
        throw new FormatError('a "pose" field must be an object of speaker key to pose name');
      }
      for (const [key, val] of Object.entries(poseRaw)) {
        if (!isString(val)) throw new FormatError(`pose for "${key}" must be a string`);
        pose[key] = val;
      }
    }
    return { kind: "stage", text: stage, pose };
  }

  const pause = raw["pause"];
  if (isNumber(pause)) {
    return { kind: "pause", ms: pause };
  }

  const keys = Object.keys(raw);
  const speakerKey = keys[0];
  if (keys.length !== 1 || speakerKey === undefined) {
    throw new FormatError(`a speaker line must have exactly one key, got: ${keys.join(", ") || "(none)"}`);
  }
  const text = raw[speakerKey];
  if (!isString(text)) throw new FormatError(`line for speaker "${speakerKey}" must be a string`);
  return { kind: "speaker", speaker: speakerKey, text };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

function isRelationShape(
  v: unknown,
): v is "hallway" | "slant" | "L" | "forward" | "back" | "sideways" {
  return v === "hallway" || v === "slant" || v === "L" || v === "forward" || v === "back" || v === "sideways";
}

function parseTarget(value: unknown, path: string): Target {
  if (!isRecord(value)) throw new FormatError(`${path} must be an object`);
  const kind = value["kind"];
  if (!isString(kind)) throw new FormatError(`${path}.kind must be a string`);

  switch (kind) {
    case "square": {
      const square = value["square"];
      if (!isString(square)) throw new FormatError(`${path}.square must be a string`);
      return { kind: "square", square };
    }
    case "colour": {
      const colour = value["colour"];
      if (colour !== "light" && colour !== "dark") {
        throw new FormatError(`${path}.colour must be "light" or "dark"`);
      }
      return { kind: "colour", colour };
    }
    case "adjacent": {
      const to = value["to"];
      if (!isString(to)) throw new FormatError(`${path}.to must be a string`);
      const direction = value["direction"];
      if (direction !== "orthogonal" && direction !== "any") {
        throw new FormatError(`${path}.direction must be "orthogonal" or "any"`);
      }
      const sameColourRaw = value["sameColour"];
      if (sameColourRaw !== undefined && typeof sameColourRaw !== "boolean") {
        throw new FormatError(`${path}.sameColour must be a boolean`);
      }
      return {
        kind: "adjacent",
        to,
        direction,
        ...(sameColourRaw !== undefined ? { sameColour: sameColourRaw } : {}),
      };
    }
    case "relation": {
      const shapeRaw = value["shape"];
      if (shapeRaw !== undefined && !isRelationShape(shapeRaw)) {
        throw new FormatError(`${path}.shape is not a known relation shape`);
      }
      const distanceRaw = value["distance"];
      if (distanceRaw !== undefined && !isNumber(distanceRaw)) {
        throw new FormatError(`${path}.distance must be a number`);
      }
      return {
        kind: "relation",
        ...(shapeRaw !== undefined ? { shape: shapeRaw } : {}),
        ...(distanceRaw !== undefined ? { distance: distanceRaw } : {}),
      };
    }
    case "blocked": {
      const lineRaw = value["line"];
      if (lineRaw !== undefined && lineRaw !== "hallway" && lineRaw !== "slant") {
        throw new FormatError(`${path}.line must be "hallway" or "slant"`);
      }
      return { kind: "blocked", ...(lineRaw !== undefined ? { line: lineRaw } : {}) };
    }
    case "piece": {
      const piece = value["piece"];
      if (!isString(piece)) throw new FormatError(`${path}.piece must be a string`);
      return { kind: "piece", piece };
    }
    case "offBoard":
      return { kind: "offBoard" };
    case "choice": {
      const option = value["option"];
      if (!isString(option)) throw new FormatError(`${path}.option must be a string`);
      return { kind: "choice", option };
    }
    case "fallback":
      return { kind: "fallback" };
    default:
      throw new FormatError(`${path}.kind "${kind}" is not a known target kind`);
  }
}

// ---------------------------------------------------------------------------
// Taps
// ---------------------------------------------------------------------------

function parseWrongEntry(value: unknown, path: string): WrongEntry {
  if (!isRecord(value)) throw new FormatError(`${path} must be an object`);
  const matchRaw = value["match"];
  const lines = expectArrayOfLines(value["lines"], `${path}.lines`);
  return matchRaw === undefined ? { lines } : { match: parseTarget(matchRaw, `${path}.match`), lines };
}

function parseTap(value: unknown, path: string): Tap {
  if (!isRecord(value)) throw new FormatError(`${path} must be an object`);
  const id = value["id"];
  const prompt = value["prompt"];
  if (!isString(id)) throw new FormatError(`${path}.id must be a string`);
  if (!isString(prompt)) throw new FormatError(`${path}.prompt must be a string`);

  const leadRaw = value["lead"];
  const lead = leadRaw === undefined ? [] : expectArrayOfLines(leadRaw, `${path}.lead`);
  const target = parseTarget(value["target"], `${path}.target`);
  const right = expectArrayOfLines(value["right"], `${path}.right`);

  const wrongRaw = value["wrong"];
  if (!Array.isArray(wrongRaw)) throw new FormatError(`${path}.wrong must be an array`);
  const wrong = wrongRaw.map((w, i) => parseWrongEntry(w, `${path}.wrong[${i}]`));

  const plain = expectArrayOfLines(value["plain"], `${path}.plain`);
  const show = expectArrayOfLines(value["show"], `${path}.show`);

  return { id, prompt, lead, target, right, wrong, plain, show };
}

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export function parseChapter(data: unknown): Chapter {
  if (!isRecord(data)) throw new FormatError("chapter must be an object");

  const id = data["id"];
  const order = data["order"];
  const title = data["title"];
  const holds = data["holds"];
  if (!isString(id)) throw new FormatError("chapter.id must be a string");
  if (!isNumber(order)) throw new FormatError("chapter.order must be a number");
  if (!isString(title)) throw new FormatError("chapter.title must be a string");
  if (!isString(holds)) throw new FormatError("chapter.holds must be a string");

  const boardRaw = data["board"];
  if (!isRecord(boardRaw)) throw new FormatError("chapter.board must be an object");
  const size = boardRaw["size"];
  if (!isNumber(size)) throw new FormatError("chapter.board.size must be a number");
  const piecesRaw = boardRaw["pieces"];
  if (!Array.isArray(piecesRaw)) throw new FormatError("chapter.board.pieces must be an array");

  const charactersRaw = data["characters"];
  if (!isRecord(charactersRaw)) throw new FormatError("chapter.characters must be an object");
  const characters: Record<string, { at: string }> = {};
  for (const [key, val] of Object.entries(charactersRaw)) {
    if (!isRecord(val) || !isString(val["at"])) {
      throw new FormatError(`chapter.characters.${key}.at must be a string`);
    }
    characters[key] = { at: val["at"] };
  }

  const open = expectArrayOfLines(data["open"], "chapter.open");

  const tapsRaw = data["taps"];
  if (!Array.isArray(tapsRaw)) throw new FormatError("chapter.taps must be an array");
  const taps = tapsRaw.map((t, i) => parseTap(t, `chapter.taps[${i}]`));

  const celebrationRaw = data["celebration"];
  if (!isRecord(celebrationRaw)) throw new FormatError("chapter.celebration must be an object");
  const cName = celebrationRaw["name"];
  const media = celebrationRaw["media"];
  if (!isString(cName)) throw new FormatError("chapter.celebration.name must be a string");
  if (!isString(media)) throw new FormatError("chapter.celebration.media must be a string");
  const script = expectArrayOfLines(celebrationRaw["script"], "chapter.celebration.script");

  return {
    id,
    order,
    title,
    holds,
    board: { size, pieces: piecesRaw },
    characters,
    open,
    taps,
    celebration: { name: cName, media, script },
  };
}
