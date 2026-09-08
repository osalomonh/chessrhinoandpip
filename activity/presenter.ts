// The interface the DOM-free engine drives to put something on screen.
//
// This is the seam the contract asks for: the engine (tap ladder,
// classification, line sequencing, completion) never touches the DOM. It
// only calls a Presenter. dom-presenter.ts implements this against real
// elements; fake-presenter.ts implements it in memory for tests.

import type { TapInput } from "./classify.js";

export type Unsubscribe = () => void;

export type Presenter = {
  /** Renders an empty size x size board. */
  renderBoard(size: number): void;
  /** Places a character (by speaker key) on a square, for the first time. */
  placeCharacter(key: string, square: string): void;
  /** Changes which image renders for a speaker. Persists until called again. */
  setPose(speaker: string, pose: string): void;

  /** Shows a line of dialogue near the named speaker. */
  showSpeakerLine(speaker: string, text: string): void;
  /** Shows a stage direction (not spoken). */
  showStageLine(text: string): void;
  /** Clears whatever showSpeakerLine/showStageLine last displayed. */
  clearDialogue(): void;

  /** Shows the prompt, narrating it via speech synthesis when available. */
  showPrompt(text: string): void;
  clearPrompt(): void;

  /** Brief highlight on a square, once correct — tapped or shown. */
  highlightSquare(square: string): void;

  /** Renders the celebration media. Its own double-play-then-rest is baked
   * into the file; the presenter does not loop or time it. */
  showCelebration(mediaUrl: string): void;
  /** Marks the celebration as resting on its final frame. Purely a state
   * hook — nothing is timed to trigger it. */
  restCelebration(): void;

  /** Leaves cleanly: removes listeners, clears the mount. */
  clear(): void;

  /** Fires for a tap that lands on a square (or other classifiable target).
   * A tap that lands nowhere classifiable never fires this — that is how
   * "a tap on a non-square does nothing" is satisfied. */
  onTap(cb: (tap: TapInput) => void): Unsubscribe;
  /** Fires for a tap anywhere on the mounted activity, used to advance
   * dialogue. */
  onTapAnywhere(cb: () => void): Unsubscribe;
};
