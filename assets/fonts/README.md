# Fonts

Self-hosted so the product has no third-party CDN request (per
`contracts/design-tokens.json`, `quality.trackers: "none"`, and the styling
agent's brief forbidding tracker-bearing font CDNs).

## Files

- `lexend-latin.woff2` — Lexend, latin subset, weights 400/500/600.
  Google's own generated stylesheet maps all three weights to this single
  file (Lexend ships as a variable font on Google Fonts), so one file
  covers the whole body-text range used by this product.
- `baloo2-latin.woff2` — Baloo 2, latin subset, weights 600/700. Same
  situation: Google's stylesheet maps both weights to this one file.
- `OFL.txt` — the SIL Open Font License 1.1, the licence both families are
  released under.

## Source

Fetched from `https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&family=Baloo+2:wght@600;700&display=swap`
(requested with a Chrome user agent so the API returns woff2), then the
`latin`-subset file for each family was downloaded directly from
`fonts.gstatic.com`. Only the `latin` subset was kept — this product's text
is English only; the `latin-ext`, `vietnamese` and `devanagari` subsets
Google also offers were not needed and were discarded.

## Licence

SIL Open Font License, Version 1.1. See `OFL.txt` in this folder. Both
Lexend and Baloo 2 are licensed under the OFL by their respective
designers/foundries, distributed via Google Fonts.

## Size

`lexend-latin.woff2`: ~38.8 KB
`baloo2-latin.woff2`: ~32.4 KB
Total: ~71 KB — well under the ~600 KB budget.
