// Renders the path screen: the sixteen-square strip, the trailing
// free-play square, and the footer link to About. DOM-only — the model
// (which colour and state each square gets) comes from shell/path-model.ts
// and is tested there; see shell/path-model.test.ts.
//
// See contracts/shell.md, "The path" and "The footer".
//
// DOM structure:
//
// <div class="path-screen">
//   <div class="path-strip">
//     <button class="path-square path-square--dark path-square--current"
//             data-chapter="ch01" aria-label="Chapter 1"> ... 16 of these ... </button>
//     <div class="path-square path-square--freeplay" aria-hidden="true"></div>
//   </div>
//   <footer class="path-footer">
//     <a class="path-footer-link" href="#/about">About</a>
//   </footer>
// </div>

import * as progress from "../progress/index.js";
import type { StoryPack } from "../activity/index.js";
import { buildPath, pathSquareClasses } from "./path-model.js";
import { chapterSquareLabel, footerAboutLinkText } from "./strings.js";

export function renderPath(mount: HTMLElement, pack: StoryPack): void {
  mount.textContent = "";
  mount.className = "path-screen";

  const strip = document.createElement("div");
  strip.className = "path-strip";

  const currentId = progress.currentChapter(pack);
  const entries = buildPath(pack.chapters, progress.isComplete, currentId);

  let currentEl: HTMLElement | undefined;

  for (const entry of entries) {
    if (entry.kind === "freePlay") {
      const square = document.createElement("div");
      square.className = pathSquareClasses(entry).join(" ");
      square.setAttribute("aria-hidden", "true");
      strip.appendChild(square);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = pathSquareClasses(entry).join(" ");
    button.dataset.chapter = entry.id;
    button.setAttribute("aria-label", chapterSquareLabel(entry.position));
    button.addEventListener("click", () => {
      window.location.hash = `#/${entry.id}`;
    });
    if (entry.state === "current") currentEl = button;
    strip.appendChild(button);
  }

  mount.appendChild(strip);

  const footer = document.createElement("footer");
  footer.className = "path-footer";
  const link = document.createElement("a");
  link.className = "path-footer-link";
  link.href = "#/about";
  link.textContent = footerAboutLinkText;
  footer.appendChild(link);
  mount.appendChild(footer);

  // "the current chapter is on screen on load" — contracts/shell.md.
  currentEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
