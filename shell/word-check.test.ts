// Asserts the word this product never says outside About does not appear
// in any user-facing string the shell emits, and that index.html's <title>
// does not say it either. See contracts/shell.md, "The word."

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { chapterSquareLabel, footerAboutLinkText, menuLabel, pageTitle, pathBackLinkText } from "./strings.js";

const BANNED = /chess/i;

// Every non-About user-facing string the shell owns. aboutStrings is
// deliberately excluded — contracts/shell.md makes About the one place the
// word is written plainly.
const nonAboutStrings: string[] = [
  pageTitle,
  menuLabel,
  footerAboutLinkText,
  pathBackLinkText,
  ...Array.from({ length: 16 }, (_, i) => chapterSquareLabel(i + 1)),
];

test("no non-About shell string contains the banned word", () => {
  for (const value of nonAboutStrings) {
    assert.ok(!BANNED.test(value), `expected not to find "chess" in: ${value}`);
  }
});

test("index.html's <title> does not contain the banned word", () => {
  const indexPath = fileURLToPath(new URL("../index.html", import.meta.url));
  const html = readFileSync(indexPath, "utf8");
  const match = /<title>([^<]*)<\/title>/i.exec(html);
  assert.ok(match, "index.html must have a <title>");
  const title = match[1] ?? "";
  assert.ok(!BANNED.test(title), `expected not to find "chess" in <title>: ${title}`);
});
