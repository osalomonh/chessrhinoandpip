// Entry point. Owns which screen is mounted and how a route change moves
// between them. See contracts/shell.md.
//
// Compiled to dist/shell/index.js and loaded from index.html as
// `<script type="module" src="./shell/index.js">`.

import type { StoryPack } from "../activity/index.js";
import { loadPack } from "./pack-loader.js";
import { renderAbout } from "./render-about.js";
import { renderChapter, type ChapterScreenHandle } from "./render-chapter.js";
import { renderPath } from "./render-path.js";
import { parseRoute, resolveInitialRoute, type Route } from "./route.js";

function getMount(): HTMLElement {
  const el = document.getElementById("app");
  if (!el) {
    throw new Error('shell: no element with id "app" found in index.html');
  }
  return el;
}

async function main(): Promise<void> {
  const mount = getMount();
  const pack: StoryPack = await loadPack();

  let chapterScreen: ChapterScreenHandle | undefined;

  function leaveChapterScreen(): void {
    chapterScreen?.teardown();
    chapterScreen = undefined;
  }

  function show(route: Route): void {
    leaveChapterScreen();
    if (route.screen === "path") {
      renderPath(mount, pack);
    } else if (route.screen === "about") {
      renderAbout(mount);
    } else {
      chapterScreen = renderChapter(mount, pack, route.id);
    }
  }

  // Initial load: refreshing (or opening a link) mid-chapter never resumes
  // into a half-played chapter — there is no mid-chapter save. If the raw
  // hash names a chapter, replace it with the path so the URL matches what
  // is rendered.
  const rawHash = window.location.hash;
  const rawRoute = parseRoute(rawHash, pack.chapters);
  if (rawRoute.screen === "chapter") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/`);
  }
  show(resolveInitialRoute(rawHash, pack.chapters));

  window.addEventListener("hashchange", () => {
    show(parseRoute(window.location.hash, pack.chapters));
  });
}

main().catch((err: unknown) => {
  console.warn("shell: failed to start", err);
});
