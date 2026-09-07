# Rhino and Pip

Two friends invent a game on a floor. Sixteen short chapters for children aged six to eight, played by tapping squares while Rhino and Pip talk it through. Nothing is timed, nothing is scored, and a wrong tap gets a line of dialogue rather than a red flash.

**Live:** https://osalomonh.github.io/chessrhinoandpip/

## Run locally

```
npm install
npm run check     # type-check
npm test          # run every *.test.ts
npm run build     # compile to ES2020 modules and assemble dist/
npm run serve -- dist
```

Then open http://localhost:8000/. `npm run serve` with no argument serves the repository root instead, which works after a plain `npx tsc` has emitted JavaScript next to the sources.

## Open, untracked, no accounts

The code is open. The app collects nothing, tracks nothing, and has no accounts: progress is a single entry in the browser's local storage and clearing browser data clears it. There is no server beyond static file hosting.
