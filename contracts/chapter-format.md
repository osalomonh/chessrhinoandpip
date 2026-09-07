# Contract · chapter-format

The JSON a chapter is stored as. One file per chapter. Produced by a build
step from the script text; consumed by the activity runtime.

**Owned by the project lead.** The content agent implements the converter and
may propose additions. Nothing else edits this.

---

## Design rules

- **Lines are the atom.** Everything a character says or does is a line
  object. The runtime plays lines; it never parses prose.
- **The runtime never sees Rhino or Pip.** Speaker keys are strings the story
  pack defines. A second series uses different keys and the runtime does not
  care.
- **Wrong responses are a pool with optional matchers.** An entry with a
  `match` fires when the tap fits it. Entries without a `match` are the random
  pool. First matching classified entry wins; otherwise pick random.
- **Targets are a small vocabulary.** Chapter 1 needs three kinds. Later
  chapters add more. The vocabulary lives in the activity contract.
- **Every tap has all four tiers.** Right, wrong, plain, show. A missing tier
  is a converter error, not a runtime fallback.

---

## Line objects

```json
{ "pip": "This corner is the good one." }
{ "rhino": "Why." }
{ "stage": "Pip looks at his feet.", "pose": { "pip": "surprised" } }
{ "pause": 600 }
```

`pip` and `rhino` are speaker keys from the story pack. `stage` is a
direction — shown or animated, never spoken. `pause` is milliseconds.

`pose` is optional and sets which image renders for the named speakers. It
persists until another line changes it. A pose that does not exist in the
pack falls back to `idle` and is not an error.

Only the **prompt** is narrated. Character lines are text on screen.

---

## Pose annotation in the source

Stage directions in the script carry an optional tag the converter reads:

```
[pip:sitting] Pip sits down hard on the near-right corner.
```

The prose stays for the reader. The tag drives the render. Most lines need no
tag — `idle` is the default and it is correct for two characters standing and
talking. The Shows are where poses do real work.

---

## Target kinds

What a tap is asking for. `target` uses these; so does `match` in the wrong
pool.

### Computable from the tap alone

| Kind | Fields | Means |
|---|---|---|
| `square` | `square: "h1"` | that exact square |
| `colour` | `colour: "light" \| "dark"` | any square of that colour |
| `adjacent` | `to: "rhino"`, `direction: "orthogonal" \| "any"` | touching a character |
| `relation` | `shape: "hallway" \| "slant" \| "L" \| "forward" \| "back" \| "sideways"`, `distance?: number` | geometric relation to the origin square |
| `blocked` | `line: "hallway" \| "slant"` | on the right line, but past a piece |
| `piece` | `piece: "pawn" \| "king" \| ... \| "own" \| "enemy"` | tapped a piece of that kind |
| `offBoard` | — | tapped outside the board entirely |
| `choice` | `option: "yes"` | a picture or button, not a square |
| `fallback` | — | anything not matched above. **Must be last.** |

### Not computable yet

Some labels in later chapters need capabilities that do not exist:

| Label | Needs |
|---|---|
| still looked at, a looked-at step | check detection — chapter 11 |
| a rook that already moved, hid while looked at | move history — chapter 15 |
| a take that is not mate, stalemate trap | full rules — chapter 13 |

The converter **fails loudly** on a label it cannot resolve. Chapter 1
converts today; chapter 15 will not until the capability exists, and the
failure names exactly what is missing. That is the intended behaviour.

---

## Classifier labels

The scripts use free English labels — *"a slant"*, *"through the box"*,
*"somewhere else"*. `contracts/classifiers.json` maps each label to a match
rule.

The converter looks every label up. **An unknown label is a build failure.**
It does not guess, and it does not fall back to random.

Adding a label means adding it to `classifiers.json` — which is a contract
change, and therefore the project lead's.

### Order matters

Entries are checked **top to bottom** and the first match wins. The scripts
say so explicitly: *"Match the square, top to bottom."*

`fallback` must be the last entry in any tap that has one. The converter
rejects a tap where `fallback` is not last, or where a tap has no `fallback`
and no other entry could match some reachable square.

---

## Chapter 1, complete structure

Tap 1 fully worked. Taps 2–4 follow the identical shape.

```json
{
  "id": "ch01",
  "order": 1,
  "title": "The Fancy Corner",
  "holds": "Two colours, alternating. Light on the right.",

  "board": { "size": 8, "pieces": [] },

  "characters": {
    "pip":   { "at": "a1" },
    "rhino": { "at": "h1" }
  },

  "open": [
    { "stage": "The floor is already there. No pieces." },
    { "pip":   "This corner is the good one." },
    { "rhino": "Why." },
    { "pip":   "Dark is fancier." },
    { "rhino": "I thought the one on the right was light." },
    { "pip":   "That cannot be right. Dark has mystery. Dark has style." },
    { "rhino": "We should ask." }
  ],

  "taps": [
    {
      "id": "t1",
      "prompt": "Tap the light corner.",
      "lead": [],
      "target": { "kind": "square", "square": "h1" },

      "right": [
        { "stage": "Pip looks at his feet.", "pose": { "pip": "surprised" } },
        { "pip":   "Oh." },
        { "rhino": "Light on the right." },
        { "pip":   "It is a little fancy." },
        { "rhino": "A little." },
        { "pip":   "I was still mostly right." },
        { "rhino": "You were standing." }
      ],

      "wrong": [
        { "match": { "kind": "square", "square": "a1" },
          "lines": [
            { "pip":   "See. They like mine." },
            { "rhino": "They tapped yours. Yours is dark." },
            { "pip":   "Dark is still winning." },
            { "rhino": "Dark is not the corner we need. The right one." }
          ]},
        { "match": { "kind": "square", "square": "h8" },
          "lines": [
            { "rhino": "That is a corner. That is light." },
            { "pip":   "Then we are done." },
            { "rhino": "That one is far. We want the near one." },
            { "pip":   "Near is a feeling." },
            { "rhino": "Near is by your hand." }
          ]},
        { "match": { "kind": "colour", "colour": "light" },
          "lines": [
            { "rhino": "That one is light." },
            { "pip":   "Light is what we wanted." },
            { "rhino": "Light in a corner." },
            { "pip":   "Corners are so far away." },
            { "rhino": "This one is by your right hand." }
          ]},
        { "match": { "kind": "colour", "colour": "dark" },
          "lines": [
            { "pip":   "Another one of mine." },
            { "rhino": "That one is dark." },
            { "pip":   "I have many." },
            { "rhino": "We need the light one. In the corner. On the right." }
          ]}
      ],

      "plain": [
        { "rhino": "Your right hand. That corner. The light one." }
      ],

      "show": [
        { "stage": "Pip sits down hard on the near-right corner. He looks surprised to be there.",
          "pose": { "pip": "sitting" } },
        { "pip":   "I was going to my corner." },
        { "rhino": "That is the one." },
        { "pip":   "This one is light." },
        { "rhino": "Light on the right." },
        { "pip":   "I meant to do that." },
        { "rhino": "Of course." }
      ]
    },

    { "id": "t2", "prompt": "Tap a light square.",
      "target": { "kind": "colour", "colour": "light" }, "...": "" },

    { "id": "t3", "prompt": "Tap a dark square.",
      "target": { "kind": "colour", "colour": "dark" }, "...": "" },

    { "id": "t4", "prompt": "Tap the next square.",
      "target": { "kind": "adjacent", "to": "rhino", "direction": "orthogonal" }, "...": "" }
  ],

  "celebration": {
    "name": "The Very Tall Ice Cream",
    "media": "celebrations/ch01_very_tall_ice_cream.gif",
    "script": [
      { "stage": "An ice cream arrives on the light corner. It is taller than Rhino." },
      { "pip":   "Is this because of the corner." },
      { "rhino": "I think it is because we finished." },
      { "...": "" }
    ]
  }
}
```

---

## Classified versus random

Chapter 1 tap 1 is **fully classified** — four entries covering a1, h8, any
light, any dark. No random pool. Every wrong square gets a line that fits it.

The rest of chapter 1 uses random pools, which is correct: on tap 2 every
wrong square is dark, so the lines can assume it.

The converter rejects a tap where a wrong square could fall through both the
classified entries and the pool with no response.

---

## What the converter does

Reads the script text. Emits one JSON file per chapter. Fails loudly on any
tap missing a tier, any unknown speaker, any target it cannot parse, and the
three mechanical voice checks in `story-pack.md`.

It does not judge the writing. It checks shape.

---

## Validation

A JSON schema lives beside this file. The build step validates every chapter
against it before the app can compile. A chapter that fails validation is a
build failure, not a runtime surprise.
