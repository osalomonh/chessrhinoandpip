// Story-agnostic types for the chapter runtime.
//
// These mirror contracts/chapter-format.md and contracts/story-pack.md, but
// are defined here rather than imported from tools/ (the content agent's
// code) so that activity/ has no dependency on the converter. Speaker keys
// are plain strings throughout: the runtime never assumes "pip" or "rhino".

/** A line object exactly as it appears in chapter JSON, before it has been
 * classified into speaker / stage / pause. Keys are whatever the pack uses. */
export type RawLine = Record<string, unknown>;

export type Target =
  | { kind: "square"; square: string }
  | { kind: "colour"; colour: "light" | "dark" }
  | {
      kind: "adjacent";
      to: string;
      direction: "orthogonal" | "any";
      sameColour?: boolean;
    }
  | {
      kind: "relation";
      shape?: "hallway" | "slant" | "L" | "forward" | "back" | "sideways";
      distance?: number;
    }
  | { kind: "blocked"; line?: "hallway" | "slant" }
  | { kind: "piece"; piece: string }
  | { kind: "offBoard" }
  | { kind: "choice"; option: string }
  | { kind: "fallback" };

export type WrongEntry = {
  /** Present for a classified entry; absent for a member of the random pool. */
  match?: Target;
  lines: RawLine[];
};

export type Tap = {
  id: string;
  prompt: string;
  lead: RawLine[];
  target: Target;
  right: RawLine[];
  wrong: WrongEntry[];
  plain: RawLine[];
  show: RawLine[];
};

export type Chapter = {
  id: string;
  order: number;
  title: string;
  holds: string;
  board: { size: number; pieces: unknown[] };
  characters: Record<string, { at: string }>;
  open: RawLine[];
  taps: Tap[];
  celebration: { name: string; media: string; script: RawLine[] };
};

export type SpeakerDef = { name: string; poses: string[] };

/** The pack manifest, plus a base URL the runtime uses to build asset paths:
 * `${baseUrl}/speakers/<key>/<pose>.png` and `${baseUrl}/${celebration.media}`.
 * pack.json itself carries no base URL; whoever constructs this object
 * (the shell) supplies it. */
export type StoryPack = {
  id: string;
  title: string;
  series: number;
  speakers: Record<string, SpeakerDef>;
  chapters: string[];
  celebrations: Record<string, string>;
  baseUrl: string;
};

export type ActivityHandle = {
  start(): void;
  onComplete(cb: (chapterId: string) => void): void;
  abort(): void;
};

/** Raised when JSON does not match the shapes above. */
export class FormatError extends Error {}
