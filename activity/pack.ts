// Turns unknown JSON (pack.json) plus a base URL into a typed StoryPack.

import type { SpeakerDef, StoryPack } from "./types.js";
import { FormatError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function parseSpeakerDef(value: unknown, path: string): SpeakerDef {
  if (!isRecord(value)) throw new FormatError(`${path} must be an object`);
  const name = value["name"];
  const poses = value["poses"];
  if (!isString(name)) throw new FormatError(`${path}.name must be a string`);
  if (!isStringArray(poses)) throw new FormatError(`${path}.poses must be an array of strings`);
  return { name, poses };
}

/** Parses pack.json. `baseUrl` is supplied by the caller (the shell), since
 * the manifest itself does not carry one — see contracts/story-pack.md. */
export function parseStoryPack(data: unknown, baseUrl: string): StoryPack {
  if (!isRecord(data)) throw new FormatError("pack must be an object");

  const id = data["id"];
  const title = data["title"];
  const series = data["series"];
  if (!isString(id)) throw new FormatError("pack.id must be a string");
  if (!isString(title)) throw new FormatError("pack.title must be a string");
  if (!isNumber(series)) throw new FormatError("pack.series must be a number");

  const speakersRaw = data["speakers"];
  if (!isRecord(speakersRaw)) throw new FormatError("pack.speakers must be an object");
  const speakers: Record<string, SpeakerDef> = {};
  for (const [key, val] of Object.entries(speakersRaw)) {
    speakers[key] = parseSpeakerDef(val, `pack.speakers.${key}`);
  }

  const chapters = data["chapters"];
  if (!isStringArray(chapters)) throw new FormatError("pack.chapters must be an array of strings");

  const celebrationsRaw = data["celebrations"];
  if (!isRecord(celebrationsRaw)) throw new FormatError("pack.celebrations must be an object");
  const celebrations: Record<string, string> = {};
  for (const [key, val] of Object.entries(celebrationsRaw)) {
    if (!isString(val)) throw new FormatError(`pack.celebrations.${key} must be a string`);
    celebrations[key] = val;
  }

  return { id, title, series, speakers, chapters, celebrations, baseUrl };
}
