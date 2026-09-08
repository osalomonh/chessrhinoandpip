import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTap, resolveOrigin, squareColour, type ClassifyContext } from "./classify.js";
import type { Target } from "./types.js";

const characters: Record<string, { at: string }> = { pip: { at: "a1" }, rhino: { at: "h1" } };
const baseCtx: ClassifyContext = { boardSize: 8, characters };

test("square colour: a1 is dark, h1 is light", () => {
  assert.equal(squareColour("a1"), "dark");
  assert.equal(squareColour("h1"), "light");
});

test("square target matches only the exact square", () => {
  const target: Target = { kind: "square", square: "h1" };
  assert.equal(classifyTap({ kind: "square", square: "h1" }, target, baseCtx), true);
  assert.equal(classifyTap({ kind: "square", square: "a1" }, target, baseCtx), false);
  assert.equal(classifyTap({ kind: "offBoard" }, target, baseCtx), false);
});

test("colour target matches any square of that colour", () => {
  const light: Target = { kind: "colour", colour: "light" };
  assert.equal(classifyTap({ kind: "square", square: "h1" }, light, baseCtx), true);
  assert.equal(classifyTap({ kind: "square", square: "b1" }, light, baseCtx), true);
  assert.equal(classifyTap({ kind: "square", square: "a1" }, light, baseCtx), false);
});

test("adjacent orthogonal matches only squares sharing an edge", () => {
  const target: Target = { kind: "adjacent", to: "rhino", direction: "orthogonal" };
  // h1's orthogonal neighbours are g1 and h2.
  assert.equal(classifyTap({ kind: "square", square: "g1" }, target, baseCtx), true);
  assert.equal(classifyTap({ kind: "square", square: "h2" }, target, baseCtx), true);
  // g2 touches diagonally only.
  assert.equal(classifyTap({ kind: "square", square: "g2" }, target, baseCtx), false);
  // h1 itself does not count as adjacent to itself.
  assert.equal(classifyTap({ kind: "square", square: "h1" }, target, baseCtx), false);
});

test("adjacent any includes the diagonal neighbour", () => {
  const target: Target = { kind: "adjacent", to: "rhino", direction: "any" };
  assert.equal(classifyTap({ kind: "square", square: "g2" }, target, baseCtx), true);
});

test("adjacent sameColour narrows to touching squares of a matching colour", () => {
  const target: Target = { kind: "adjacent", to: "rhino", direction: "any", sameColour: true };
  // g2 is the diagonal neighbour of h1 and shares its colour (light).
  assert.equal(classifyTap({ kind: "square", square: "g2" }, target, baseCtx), true);
  // g1/h2 are orthogonal neighbours, opposite colour (dark) — excluded.
  assert.equal(classifyTap({ kind: "square", square: "g1" }, target, baseCtx), false);
});

test("adjacent to an unknown character never matches", () => {
  const target: Target = { kind: "adjacent", to: "ghost", direction: "any" };
  assert.equal(classifyTap({ kind: "square", square: "g2" }, target, baseCtx), false);
});

test("relation needs an origin; without one it never matches", () => {
  const target: Target = { kind: "relation", shape: "hallway" };
  assert.equal(classifyTap({ kind: "square", square: "a2" }, target, baseCtx), false);
});

test("relation: hallway, slant and L against an origin", () => {
  const ctx: ClassifyContext = { ...baseCtx, origin: "d4" };
  assert.equal(classifyTap({ kind: "square", square: "d8" }, { kind: "relation", shape: "hallway" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "a4" }, { kind: "relation", shape: "hallway" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "a1" }, { kind: "relation", shape: "slant" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "d8" }, { kind: "relation", shape: "slant" }, ctx), false);
  assert.equal(classifyTap({ kind: "square", square: "e6" }, { kind: "relation", shape: "L" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "d5" }, { kind: "relation", shape: "L" }, ctx), false);
});

test("relation: forward, back, sideways and distance", () => {
  const ctx: ClassifyContext = { ...baseCtx, origin: "d4" };
  assert.equal(classifyTap({ kind: "square", square: "d6" }, { kind: "relation", shape: "forward" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "d2" }, { kind: "relation", shape: "forward" }, ctx), false);
  assert.equal(classifyTap({ kind: "square", square: "d2" }, { kind: "relation", shape: "back" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "f4" }, { kind: "relation", shape: "sideways" }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "d6" }, { kind: "relation", shape: "sideways" }, ctx), false);
  assert.equal(classifyTap({ kind: "square", square: "d6" }, { kind: "relation", distance: 2 }, ctx), true);
  assert.equal(classifyTap({ kind: "square", square: "d5" }, { kind: "relation", distance: 2 }, ctx), false);
});

test("blocked and piece never match without pieces on the board", () => {
  assert.equal(classifyTap({ kind: "square", square: "a1" }, { kind: "blocked" }, baseCtx), false);
  assert.equal(classifyTap({ kind: "square", square: "a1" }, { kind: "piece", piece: "pawn" }, baseCtx), false);
});

test("offBoard and choice match their own tap kind only", () => {
  assert.equal(classifyTap({ kind: "offBoard" }, { kind: "offBoard" }, baseCtx), true);
  assert.equal(classifyTap({ kind: "square", square: "a1" }, { kind: "offBoard" }, baseCtx), false);
  assert.equal(classifyTap({ kind: "choice", option: "yes" }, { kind: "choice", option: "yes" }, baseCtx), true);
  assert.equal(classifyTap({ kind: "choice", option: "no" }, { kind: "choice", option: "yes" }, baseCtx), false);
});

test("fallback matches anything", () => {
  const target: Target = { kind: "fallback" };
  assert.equal(classifyTap({ kind: "square", square: "a1" }, target, baseCtx), true);
  assert.equal(classifyTap({ kind: "offBoard" }, target, baseCtx), true);
  assert.equal(classifyTap({ kind: "choice", option: "yes" }, target, baseCtx), true);
});

test("resolveOrigin uses the character named by an adjacent target's `to`", () => {
  const target: Target = { kind: "adjacent", to: "rhino", direction: "orthogonal" };
  assert.equal(resolveOrigin(target, characters), "h1");
});

test("resolveOrigin is undefined when the target names no character", () => {
  const target: Target = { kind: "colour", colour: "light" };
  assert.equal(resolveOrigin(target, characters), undefined);
});
