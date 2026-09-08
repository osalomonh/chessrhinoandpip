// Every user-facing string the shell emits lives here — headings, aria
// labels, link text, the page title used by index.html — so that a single
// test (shell/word-check.test.ts) can scan all of it for the one word this
// product never says outside About. See contracts/shell.md.
//
// About is the sole exception: contracts/shell.md says it "names the thing
// plainly," so aboutStrings is kept separate and is not scanned.

/** Mirrors index.html's <title>. Kept here so the word-check test has one
 * place to point at; index.html itself is checked by reading the file. */
export const pageTitle = "Rhino and Pip";

/** aria-label for the discreet top-left menu on the chapter screen. */
export const menuLabel = "Return to the path";

/** The footer's only text, on the path screen. */
export const footerAboutLinkText = "About";

/** The link back to the path at the end of About. */
export const pathBackLinkText = "Back to the path";

/** aria-label for a path square, 1-indexed. Not shown as visible text —
 * the path carries no title and no text above the strip — but a square is
 * still a button, and a button needs an accessible name. */
export function chapterSquareLabel(position: number): string {
  return `Chapter ${position}`;
}

/**
 * About: parent-facing prose, in the order contracts/shell.md specifies.
 * This is the one screen allowed to write the word plainly.
 */
export const aboutStrings = {
  heading: "About Rhino and Pip",

  whatThisIs:
    "Rhino and Pip is a story told in sixteen short chapters. Two friends invent a game on a floor, one idea at a time. By the end, the game they have invented is chess.",

  whoItsFor:
    "It is made for children about six to eight years old, with a parent or another reader nearby if they would like one.",

  privacy:
    "Nothing is collected and nothing is tracked. There is no account. Progress lives only in this browser, on this device, and clearing browser data clears it.",

  openCodeIntro: "The code is open:",
  openCodeLinkText: "github.com/osalomonh/chessrhinoandpip",
  openCodeLinkHref: "https://github.com/osalomonh/chessrhinoandpip",

  backLinkText: pathBackLinkText,
} as const;
