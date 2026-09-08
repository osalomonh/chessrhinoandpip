// Public entry point. See contracts/activity.md for the interface this
// implements.

import { createDomPresenter } from "./dom-presenter.js";
import { createEngine } from "./engine.js";
import type { ActivityHandle, Chapter, StoryPack } from "./types.js";

export function playChapter(chapter: Chapter, pack: StoryPack, mount: HTMLElement): ActivityHandle {
  const presenter = createDomPresenter(pack, mount);
  const engine = createEngine(chapter, presenter);
  return {
    start: engine.start,
    onComplete: engine.onComplete,
    abort: engine.abort,
  };
}

export type { ActivityHandle, Chapter, StoryPack, SpeakerDef, Tap, Target, WrongEntry, RawLine } from "./types.js";
export { parseChapter, parseLine, type ParsedLine } from "./chapter.js";
export { parseStoryPack } from "./pack.js";
export { FormatError } from "./types.js";
