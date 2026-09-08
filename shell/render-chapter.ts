// Mounts the activity runtime for one chapter. DOM-only.
//
// Loads pack.json (already cached by the caller) and this chapter's JSON,
// parses both, creates a mount element and calls playChapter — then wires
// onComplete to progress.markComplete plus a return to the path, and
// renders the discreet top-left menu that aborts and returns to the path.
//
// If the chapter JSON cannot be fetched or parsed — true today for chapters
// 2 through 16, which have no JSON yet — this warns to the console and
// returns to the path with nothing shown, per contracts/shell.md: nothing
// in this product reads as an error.
//
// DOM structure:
//
// <div class="chapter-screen">
//   <button class="chapter-menu" aria-label="Return to the path">
//     <svg aria-hidden="true" focusable="false"> ... </svg>
//   </button>
//   <div class="chapter-activity"> ... activity/dom-presenter.ts's markup ... </div>
// </div>

import { playChapter } from "../activity/index.js";
import type { ActivityHandle, StoryPack } from "../activity/index.js";
import * as progress from "../progress/index.js";
import { loadChapter } from "./chapter-loader.js";
import { menuLabel } from "./strings.js";

export interface ChapterScreenHandle {
  /** Aborts the running activity (if any) and stops it from mounting late
   * if still loading. Called by shell/index.ts whenever the route changes
   * away from this chapter for any reason. */
  teardown(): void;
}

const MENU_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
  '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="2.5" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function renderChapter(mount: HTMLElement, pack: StoryPack, chapterId: string): ChapterScreenHandle {
  mount.textContent = "";
  mount.className = "chapter-screen";

  let handle: ActivityHandle | undefined;
  let left = false;

  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "chapter-menu";
  menu.setAttribute("aria-label", menuLabel);
  menu.innerHTML = MENU_ICON;
  menu.addEventListener("click", () => {
    if (left) return;
    left = true;
    handle?.abort();
    window.location.hash = "#/";
  });
  mount.appendChild(menu);

  const activityMount = document.createElement("div");
  activityMount.className = "chapter-activity";
  mount.appendChild(activityMount);

  loadChapter(chapterId)
    .then((chapter) => {
      if (left) return; // the route moved on while this was in flight
      handle = playChapter(chapter, pack, activityMount);
      handle.onComplete((id) => {
        if (left) return;
        left = true;
        progress.markComplete(id);
        window.location.hash = "#/";
      });
      handle.start();
    })
    .catch((err: unknown) => {
      console.warn(`shell: chapter "${chapterId}" could not be loaded`, err);
      if (left) return;
      left = true;
      window.location.hash = "#/";
    });

  return {
    teardown() {
      if (left) return;
      left = true;
      handle?.abort();
    },
  };
}
