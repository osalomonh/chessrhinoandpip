// Classifying a tap against a Target. See contracts/activity.md
// ("Classifying a tap") and contracts/chapter-format.md ("Target kinds").
//
// Deliberately does not import anything from a rules layer. `blocked` and
// `piece` need pieces on the board to mean anything; chapter 1's board is
// always empty, so they simply never match here. That is correct, not a
// stub to fill in later without a contract change.

import type { Target } from "./types.js";

export type TapInput = { kind: "square"; square: string } | { kind: "offBoard" } | { kind: "choice"; option: string };

export type ClassifyContext = {
  boardSize: number;
  characters: Record<string, { at: string }>;
  /** The origin square for `relation` matches: the character named in the
   * tap's target `to` field, or the piece being moved (none in chapter 1). */
  origin?: string;
};

function squareToCoords(square: string): { file: number; rank: number } {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square.slice(1)) - 1;
  return { file, rank };
}

function squareName(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

/** (file + rank) % 2 === 0 is dark; a1 is file 0, rank 0. h1 is light. */
export function squareColour(square: string): "light" | "dark" {
  const { file, rank } = squareToCoords(square);
  return (file + rank) % 2 === 0 ? "dark" : "light";
}

/** Resolves the origin square for a tap's own target, per the rule in
 * contracts/activity.md: the character named by `to` (only `adjacent`
 * carries one), or undefined when no piece is being moved. */
export function resolveOrigin(target: Target, characters: Record<string, { at: string }>): string | undefined {
  if (target.kind !== "adjacent") return undefined;
  const character = characters[target.to];
  return character?.at;
}

export function classifyTap(tap: TapInput, target: Target, ctx: ClassifyContext): boolean {
  switch (target.kind) {
    case "square":
      return tap.kind === "square" && tap.square === target.square;

    case "colour":
      return tap.kind === "square" && squareColour(tap.square) === target.colour;

    case "adjacent": {
      if (tap.kind !== "square") return false;
      const anchor = ctx.characters[target.to];
      if (!anchor) return false;
      const a = squareToCoords(anchor.at);
      const b = squareToCoords(tap.square);
      const dx = Math.abs(a.file - b.file);
      const dy = Math.abs(a.rank - b.rank);
      if (dx === 0 && dy === 0) return false;
      const touches = target.direction === "orthogonal" ? dx + dy === 1 : dx <= 1 && dy <= 1;
      if (!touches) return false;
      if (target.sameColour !== undefined) {
        const same = squareColour(tap.square) === squareColour(anchor.at);
        if (target.sameColour !== same) return false;
      }
      return true;
    }

    case "relation": {
      if (tap.kind !== "square" || ctx.origin === undefined) return false;
      const o = squareToCoords(ctx.origin);
      const s = squareToCoords(tap.square);
      const dx = s.file - o.file;
      const dy = s.rank - o.rank;
      if (dx === 0 && dy === 0) return false;
      if (target.distance !== undefined) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (distance !== target.distance) return false;
      }
      if (target.shape === undefined) return true;
      switch (target.shape) {
        case "hallway":
          return dx === 0 || dy === 0;
        case "slant":
          return Math.abs(dx) === Math.abs(dy);
        case "L":
          return (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
        case "forward":
          return dy > 0;
        case "back":
          return dy < 0;
        case "sideways":
          return dy === 0 && dx !== 0;
      }
      return false;
    }

    case "blocked":
      return false;

    case "piece":
      return false;

    case "offBoard":
      return tap.kind === "offBoard";

    case "choice":
      return tap.kind === "choice" && tap.option === target.option;

    case "fallback":
      return true;
  }
}

/** Finds a single representative square that satisfies `target`, for
 * highlighting when `show` resolves a tap (there is no tapped square to
 * highlight in that case — the child never got it right). Scans squares in
 * a fixed order: a1..h1, a2..h2, ... up to the board size. For `adjacent`
 * targets, prefers an orthogonal neighbour of the origin over a diagonal
 * one, still in that same scan order — an orthogonal neighbour is always a
 * valid "adjacent" square whether the target's own direction is
 * "orthogonal" or "any". Returns undefined if nothing on the board
 * satisfies the target (should not happen for chapter 1). */
export function findRepresentativeSquare(target: Target, ctx: ClassifyContext, boardSize: number): string | undefined {
  function scan(t: Target): string | undefined {
    for (let rank = 0; rank < boardSize; rank += 1) {
      for (let file = 0; file < boardSize; file += 1) {
        const square = squareName(file, rank);
        if (classifyTap({ kind: "square", square }, t, ctx)) return square;
      }
    }
    return undefined;
  }

  if (target.kind === "adjacent") {
    const orthogonal = scan({ ...target, direction: "orthogonal" });
    if (orthogonal) return orthogonal;
  }
  return scan(target);
}
