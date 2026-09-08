// Parses the URL hash into a Route. DOM-free: takes the raw hash string
// (e.g. from location.hash) and the pack's chapter id list, and decides
// which screen it names. No window, history or fetch here — see
// shell/index.ts for how the result is used.
//
// See contracts/shell.md, "Routing by URL hash."

export type Route =
  | { screen: "path" }
  | { screen: "chapter"; id: string }
  | { screen: "about" };

const CHAPTER_HASH = /^\/(ch\d{2})$/;

/**
 * Parses a hash (with or without its leading "#") into a Route.
 *
 * Anything not recognised — empty, "/", "/about", or a two-digit "/chNN"
 * whose id is in `chapterIds` — resolves to the path. That includes
 * malformed chapter ids ("/ch1"), out-of-range ones ("/ch17" when the pack
 * only has sixteen), and not-yet-built routes ("/play", "/play/setup").
 * Nothing here 404s; the path is always a safe landing spot.
 */
export function parseRoute(hash: string, chapterIds: readonly string[]): Route {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;

  if (path === "" || path === "/") return { screen: "path" };
  if (path === "/about") return { screen: "about" };

  const match = CHAPTER_HASH.exec(path);
  if (match) {
    const id = match[1];
    if (id !== undefined && chapterIds.includes(id)) {
      return { screen: "chapter", id };
    }
  }

  return { screen: "path" };
}

/**
 * The initial-load rule: refreshing (or opening a link) mid-chapter must not
 * resume into a half-played chapter, since there is no mid-chapter save. A
 * chapter route resolves to the path instead; About and the path itself are
 * unaffected. shell/index.ts uses this only for the very first hash read on
 * load — every hash after that is handled by parseRoute via hashchange.
 */
export function resolveInitialRoute(hash: string, chapterIds: readonly string[]): Route {
  const route = parseRoute(hash, chapterIds);
  return route.screen === "chapter" ? { screen: "path" } : route;
}
