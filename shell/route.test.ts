import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRoute, resolveInitialRoute } from "./route.js";

const chapterIds = Array.from({ length: 16 }, (_, i) => `ch${String(i + 1).padStart(2, "0")}`);

test("empty hash is the path", () => {
  assert.deepEqual(parseRoute("", chapterIds), { screen: "path" });
});

test("bare # is the path", () => {
  assert.deepEqual(parseRoute("#", chapterIds), { screen: "path" });
});

test("#/ is the path", () => {
  assert.deepEqual(parseRoute("#/", chapterIds), { screen: "path" });
});

test("#/ch01 is a chapter route", () => {
  assert.deepEqual(parseRoute("#/ch01", chapterIds), { screen: "chapter", id: "ch01" });
});

test("#/ch16 is a chapter route", () => {
  assert.deepEqual(parseRoute("#/ch16", chapterIds), { screen: "chapter", id: "ch16" });
});

test("#/about is the About route", () => {
  assert.deepEqual(parseRoute("#/about", chapterIds), { screen: "about" });
});

test("#/play is the path (not yet built)", () => {
  assert.deepEqual(parseRoute("#/play", chapterIds), { screen: "path" });
});

test("#/play/setup is the path (not yet built)", () => {
  assert.deepEqual(parseRoute("#/play/setup", chapterIds), { screen: "path" });
});

test("an unrecognised hash is the path", () => {
  assert.deepEqual(parseRoute("#/nonsense", chapterIds), { screen: "path" });
});

test("a malformed chapter id (single digit) is the path, not a chapter", () => {
  assert.deepEqual(parseRoute("#/ch1", chapterIds), { screen: "path" });
});

test("a well-formed but out-of-range chapter id is the path, not a chapter", () => {
  // Two digits, matches the shape, but ch17 is not in this pack's chapter list.
  assert.deepEqual(parseRoute("#/ch17", chapterIds), { screen: "path" });
});

test("resolveInitialRoute sends a chapter route to the path on load", () => {
  assert.deepEqual(resolveInitialRoute("#/ch03", chapterIds), { screen: "path" });
});

test("resolveInitialRoute leaves About alone on load", () => {
  assert.deepEqual(resolveInitialRoute("#/about", chapterIds), { screen: "about" });
});

test("resolveInitialRoute leaves the path alone on load", () => {
  assert.deepEqual(resolveInitialRoute("#/", chapterIds), { screen: "path" });
  assert.deepEqual(resolveInitialRoute("", chapterIds), { screen: "path" });
});
