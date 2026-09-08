// Fetches and parses one chapter's JSON. Uses fetch, so this is not part of
// the DOM-free test surface. Callers (shell/render-chapter.ts) are
// responsible for the "fetch or parse failure means the path, silently"
// rule in contracts/shell.md.

import { parseChapter } from "../activity/index.js";
import type { Chapter } from "../activity/index.js";
import { PACK_BASE_URL } from "./pack-loader.js";

export async function loadChapter(chapterId: string): Promise<Chapter> {
  const res = await fetch(`${PACK_BASE_URL}/chapters/${chapterId}.json`);
  if (!res.ok) {
    throw new Error(`chapter "${chapterId}" fetch failed with status ${res.status}`);
  }
  const data: unknown = await res.json();
  return parseChapter(data);
}
