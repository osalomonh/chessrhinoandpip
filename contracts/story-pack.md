# Contract · story-pack

What a story must supply so the runtime can play it. Rhino and Pip is the
first pack. A second series is a second folder and nothing in the runtime
changes.

**Owned by the project lead. The content agent implements the pack.**

---

## The rule

The runtime asks the pack for things by key. It never knows what the keys
mean.

> "Give me the art for speaker `pip` in pose `surprised`."
> "Give me chapter `ch01`."
> "Give me the celebration media for `ch01`."

A pack that answers those questions is playable. That is the whole contract.

---

## Folder

```
stories/
  rhino-and-pip/
    pack.json              manifest: speakers, chapters, celebrations
    chapters/
      ch01.json            chapter-format
      ...
    speakers/
      pip/
        idle.png
        sitting.png
        ...
      rhino/
        idle.png
        ...
    celebrations/
      ch01_very_tall_ice_cream.gif
      ...
    scripts/
      series-1.txt          the source text the converter reads
```

---

## pack.json

```json
{
  "id": "rhino-and-pip",
  "title": "Rhino and Pip",
  "series": 1,
  "speakers": {
    "pip":   { "name": "Pip",   "poses": ["idle", "surprised", "sitting", "bow", "glasses"] },
    "rhino": { "name": "Rhino", "poses": ["idle", "pointing", "onbench", "pieceking"] }
  },
  "chapters": ["ch01", "ch02", "...", "ch16"],
  "celebrations": { "ch01": "celebrations/ch01_very_tall_ice_cream.gif" }
}
```

The chapter list is the path order. Progress unlocks along it.

---

## Character art

**Format:** PNG with a genuine alpha channel. Not JPG — no transparency, and
lossy re-saves compound. Not traced SVG — vectorising raster art loses the
line quality.

**Canvas: 600 × 800 px for every pose of every character.** One canvas, both
characters, so the size relationship is baked into the art rather than
computed in code.

| | Height on canvas | Baseline |
|---|---|---|
| Rhino | ~700–750px | fixed, same for every pose |
| Pip | ~51% of Rhino | same baseline |

The 51% ratio is measured from the reference art. It is the size joke and it
must not drift.

**Every pose of a character shares a baseline**, so swapping poses changes
the drawing and nothing else. A character that hops or slides when its pose
changes is a bug in the art, not the code.

Sitting poses occupy less vertical space at the same width scale. They sit on
the floor rather than being resized to fill the canvas.

**Filenames:** lowercase, underscores, no spaces. `pip_sitting.png`.

`idle` is required for every speaker. Other poses are optional — a stage
direction asking for a pose that does not exist falls back to `idle` and logs
nothing. Missing art is a content gap, never a crash.

Positions come from the chapter (`characters.pip.at`). The pack supplies how
they look; the chapter supplies where they stand.

---

## Celebrations

One GIF per chapter, plus the dialogue script in the chapter JSON.

**The GIF contains two plays and then stops.** The double play is baked into
the file rather than set with a loop count, because browser handling of
finite GIF loops is inconsistent.

**It must end on a resting pose.** After the second play the GIF freezes on
its final frame, and that image stays on screen until the child taps. A
celebration ending mid-motion leaves a child staring at a half-finished hop.

Almost every scripted celebration already ends with Rhino and Pip sitting.
That is the frame to end on.

**Target under 1MB.** Roughly 15fps at 600–800px wide.

---

## Voice rules the pack must honour

The converter enforces the checkable ones:

- No exclamation marks outside celebration scripts.
- No line addressed to the child in second person during wrong responses. The
  characters absorb the error.
- Every Show contains the exact line "That is the one." from the non-erring
  speaker.

The converter cannot check tone. That is the writer's job.

---

## What the pack does not contain

- Rules. No chess logic lives in a pack.
- Layout. The board, the prompt position, the menu — all shell.
- Progress. The pack does not know what the child has done.
- Tokens. Colour and type come from design-tokens, not the pack.

A pack is content. Everything that makes content playable is elsewhere.

---

## Series 2

A new folder under `stories/`. Different speakers, different chapters, its
own celebrations. Nothing in activity, shell, progress or rules changes.

The test of this contract: **can a second pack be added by someone who has
never seen the runtime code?** If not, the contract is incomplete.
