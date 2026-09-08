// The floor as data: given the pack's chapter order and what progress says,
// which colour and state each square gets, and where the free-play square
// sits. DOM-free — shell/render-path.ts turns this into buttons.
//
// See contracts/shell.md, "The path."

export type SquareColor = "light" | "dark";
export type SquareState = "current" | "done" | "undone";

export type PathEntry =
  | {
      kind: "chapter";
      id: string;
      /** 1-indexed position in the strip, for the accessible label. */
      position: number;
      color: SquareColor;
      state: SquareState;
    }
  | { kind: "freePlay" };

/**
 * Builds the sixteen chapter squares plus a trailing free-play square.
 *
 * Colour alternates starting dark, matching a1's colour on the board itself
 * ((file + rank) % 2 === 0 is dark, per contracts/chapter-format.md) laid
 * out as one file of squares. Exactly one chapter is "current" — whichever
 * id equals `currentId`, which the caller gets from
 * `progress.currentChapter(pack)`. Every other chapter is "done" if
 * `isComplete` says so, else "undone".
 */
export function buildPath(
  chapterIds: readonly string[],
  isComplete: (chapterId: string) => boolean,
  currentId: string,
): PathEntry[] {
  const squares: PathEntry[] = chapterIds.map((id, index) => ({
    kind: "chapter",
    id,
    position: index + 1,
    color: index % 2 === 0 ? "dark" : "light",
    state: id === currentId ? "current" : isComplete(id) ? "done" : "undone",
  }));
  squares.push({ kind: "freePlay" });
  return squares;
}

/**
 * Class list for one square. A base class always applies; a chapter square
 * additionally gets one colour class and exactly one state class. The
 * free-play square gets its own class instead, per contracts/shell.md
 * ("one more non-interactive square for free play with its own class, and
 * no text").
 */
export function pathSquareClasses(entry: PathEntry): string[] {
  if (entry.kind === "freePlay") {
    return ["path-square", "path-square--freeplay"];
  }
  return ["path-square", `path-square--${entry.color}`, `path-square--${entry.state}`];
}
