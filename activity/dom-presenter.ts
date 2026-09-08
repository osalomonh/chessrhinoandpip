// The thin DOM presentation layer. Not unit-tested (no DOM in the test
// runner) — see the report for what a person should see. Everything here is
// class names and structure; colour, size and motion timing are styles/'s
// job, per contracts/design-tokens.json.
//
// DOM structure (documented for the visual and interface agents):
//
// <div class="activity-root">
//   <div class="activity-layout">
//     <div class="activity-side activity-side--left">
//       <div class="activity-character" data-speaker="pip">
//         <img class="activity-character-image">
//         <div class="activity-character-dialogue"></div>
//       </div>
//     </div>
//     <div class="activity-board" data-size="8">
//       <div class="activity-square activity-square--dark" data-square="a1"></div>
//       ... (one per square, rank 8 down to rank 1, file a to h)
//     </div>
//     <div class="activity-side activity-side--right">
//       <div class="activity-character" data-speaker="rhino"> ... </div>
//     </div>
//   </div>
//   <div class="activity-narration"></div>   (stage-direction text)
//   <div class="activity-prompt"></div>
//   <div class="activity-celebration" hidden>
//     <img class="activity-celebration-media">
//   </div>
// </div>
//
// Class names: activity-root, activity-layout, activity-side,
// activity-side--left, activity-side--right, activity-character,
// activity-character-image, activity-character-dialogue, activity-board,
// activity-square, activity-square--light, activity-square--dark,
// activity-square--correct (added on highlight, removed on the next
// highlight), activity-narration, activity-prompt, activity-celebration,
// activity-celebration-media, activity-celebration-media--resting.
//
// The board's grid-template-columns/rows is set inline (structural, derived
// from chapter.board.size — "never hardcode a grid"); square minimum size
// and all colour comes from styles/ via the classes above.
//
// Motion: the only runtime-driven visual state change is the
// activity-square--correct class. No JS animation or timers drive it, so
// prefers-reduced-motion is satisfied entirely by a CSS transition on that
// class in styles/ (instant under the media query) — there is nothing here
// for that media query to override.

import type { TapInput } from "./classify.js";
import type { Presenter, Unsubscribe } from "./presenter.js";
import type { StoryPack } from "./types.js";

function squareName(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function fileOf(square: string): number {
  return square.charCodeAt(0) - "a".charCodeAt(0);
}

export function createDomPresenter(pack: StoryPack, mount: HTMLElement): Presenter {
  mount.textContent = "";
  mount.classList.add("activity-root");

  const layout = document.createElement("div");
  layout.className = "activity-layout";

  const leftSlot = document.createElement("div");
  leftSlot.className = "activity-side activity-side--left";
  const rightSlot = document.createElement("div");
  rightSlot.className = "activity-side activity-side--right";

  const board = document.createElement("div");
  board.className = "activity-board";

  layout.append(leftSlot, board, rightSlot);

  const narration = document.createElement("div");
  narration.className = "activity-narration";

  const prompt = document.createElement("div");
  prompt.className = "activity-prompt";

  const celebration = document.createElement("div");
  celebration.className = "activity-celebration";
  celebration.hidden = true;
  const celebrationMedia = document.createElement("img");
  celebrationMedia.className = "activity-celebration-media";
  celebration.appendChild(celebrationMedia);

  mount.append(layout, narration, prompt, celebration);

  const squareEls = new Map<string, HTMLElement>();
  const speakerImages = new Map<string, HTMLImageElement>();
  const speakerDialogues = new Map<string, HTMLElement>();
  const tapListeners = new Set<(tap: TapInput) => void>();
  const tapAnywhereListeners = new Set<() => void>();

  function poseUrl(speaker: string, pose: string): string {
    const def = pack.speakers[speaker];
    const resolvedPose = def && def.poses.includes(pose) ? pose : "idle";
    return `${pack.baseUrl}/speakers/${speaker}/${resolvedPose}.png`;
  }

  mount.addEventListener("click", () => {
    for (const cb of [...tapAnywhereListeners]) cb();
  });

  return {
    renderBoard(size: number) {
      board.textContent = "";
      squareEls.clear();
      board.dataset.size = String(size);
      board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
      board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
      for (let rank = size - 1; rank >= 0; rank -= 1) {
        for (let file = 0; file < size; file += 1) {
          const square = squareName(file, rank);
          const dark = (file + rank) % 2 === 0;
          const el = document.createElement("div");
          el.className = `activity-square ${dark ? "activity-square--dark" : "activity-square--light"}`;
          el.dataset.square = square;
          el.addEventListener("click", () => {
            for (const cb of [...tapListeners]) cb({ kind: "square", square });
          });
          board.appendChild(el);
          squareEls.set(square, el);
        }
      }
    },

    placeCharacter(key: string, square: string) {
      const wrapper = document.createElement("div");
      wrapper.className = "activity-character";
      wrapper.dataset.speaker = key;

      const img = document.createElement("img");
      img.className = "activity-character-image";
      img.alt = pack.speakers[key]?.name ?? key;
      img.src = poseUrl(key, "idle");

      const dialogue = document.createElement("div");
      dialogue.className = "activity-character-dialogue";

      wrapper.append(img, dialogue);
      (fileOf(square) < 4 ? leftSlot : rightSlot).appendChild(wrapper);

      speakerImages.set(key, img);
      speakerDialogues.set(key, dialogue);
    },

    setPose(speaker: string, pose: string) {
      const img = speakerImages.get(speaker);
      if (img) img.src = poseUrl(speaker, pose);
    },

    showSpeakerLine(speaker: string, text: string) {
      const dialogue = speakerDialogues.get(speaker);
      if (dialogue) dialogue.textContent = text;
      narration.textContent = "";
    },

    showStageLine(text: string) {
      narration.textContent = text;
    },

    clearDialogue() {
      for (const dialogue of speakerDialogues.values()) dialogue.textContent = "";
      narration.textContent = "";
    },

    showPrompt(text: string) {
      prompt.textContent = text;
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.cancel();
        speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }
    },

    clearPrompt() {
      prompt.textContent = "";
    },

    highlightSquare(square: string) {
      for (const el of squareEls.values()) el.classList.remove("activity-square--correct");
      squareEls.get(square)?.classList.add("activity-square--correct");
    },

    showCelebration(mediaUrl: string) {
      celebration.hidden = false;
      celebrationMedia.classList.remove("activity-celebration-media--resting");
      celebrationMedia.src = `${pack.baseUrl}/${mediaUrl}`;
    },

    restCelebration() {
      celebrationMedia.classList.add("activity-celebration-media--resting");
    },

    clear() {
      tapListeners.clear();
      tapAnywhereListeners.clear();
      mount.textContent = "";
    },

    onTap(cb: (tap: TapInput) => void): Unsubscribe {
      tapListeners.add(cb);
      return () => tapListeners.delete(cb);
    },

    onTapAnywhere(cb: () => void): Unsubscribe {
      tapAnywhereListeners.add(cb);
      return () => tapAnywhereListeners.delete(cb);
    },
  };
}
