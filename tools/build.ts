// Build: compile TypeScript to ES2020 modules and assemble dist/ for GitHub Pages.
// Run with `npm run build`.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dist = join(root, "dist");

// Static files served as-is. Everything under stories/ ships: the PNGs and GIFs
// are the product, not build artefacts.
const staticEntries = ["index.html", "styles", "assets", "stories"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(
  process.execPath,
  [tsc, "--outDir", dist, "--rootDir", root, "--target", "es2020"],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("build: tsc failed");
  process.exit(result.status ?? 1);
}

for (const entry of staticEntries) {
  const from = join(root, entry);
  if (!existsSync(from)) {
    console.warn(`build: ${entry} not found, skipped`);
    continue;
  }
  cpSync(from, join(dist, entry), { recursive: true });
}

console.log("build: dist/ assembled");
