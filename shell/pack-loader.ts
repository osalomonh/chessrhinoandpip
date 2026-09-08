// Loads pack.json once and caches the result for the life of the page, per
// contracts/shell.md ("Load pack.json once and cache it"). Uses fetch, so
// it is not part of the DOM-free test surface; shell/index.ts is the only
// caller.

import { parseStoryPack } from "../activity/index.js";
import type { StoryPack } from "../activity/index.js";

/** Relative to index.html, per contracts/story-pack.md's folder layout and
 * the deployment note in the task ("every URL is relative"). */
export const PACK_BASE_URL = "stories/rhino-and-pip";

let cached: Promise<StoryPack> | undefined;

/** Fetches and parses pack.json the first time it is called; every
 * subsequent call returns the same cached promise. */
export function loadPack(): Promise<StoryPack> {
  if (!cached) {
    cached = fetch(`${PACK_BASE_URL}/pack.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`pack.json fetch failed with status ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => parseStoryPack(data, PACK_BASE_URL));
  }
  return cached;
}
