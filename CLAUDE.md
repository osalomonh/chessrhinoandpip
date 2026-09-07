# Rhino and Pip

Two friends invent a game on a floor, one chapter at a time, for children aged six to eight.
TypeScript compiled to ES modules, plain DOM, no framework, no accounts, no tracking. Deployed to GitHub Pages.

## Folders

- `contracts/` — the specifications. `manifest.json` is the dependency graph; read it before dispatching any task.
- `.claude/agents/` — one agent per layer. Each owns the folders its contract lists and nothing else.
- `activity/` — the chapter runtime (contract `activity`).
- `shell/` and `index.html` — screens and navigation (contract `shell`).
- `progress/` — what a child has completed (contract `progress`).
- `styles/` — stylesheets, values from `contracts/design-tokens.json` only (contract `design-tokens`).
- `tools/` — the script-to-JSON converter, plus `build.ts` and `serve.ts`.
- `stories/rhino-and-pip/` — the story pack: author's scripts, chapter JSON, character PNGs, celebration GIFs.
- `evals/` — tests that belong to no single contract. Not type-checked; run by `npm test`.
- `dist/` — build output. Never committed.

## Gates

```
npm run check
npm test
```

Both must pass before any task is reported done. Read the summary line of every suite; a green exit code is not proof.

## Rules

- `contracts/` is read-only to every agent. If a task appears to need a contract change, stop and say what you need and why. The project lead edits contracts.
- The word "chess" never appears in user-facing text, including the page `<title>`. The About page is the only exception.
- Agents do not commit. The project lead commits.
