# Contract · activity

How a chapter plays. The runtime that reads chapter JSON and turns it into a
seven-minute sitting.

Also, later, how a free-play game plays — same runtime, different content.
This version describes chapters only. The game shape is added when free play
is built.

**Owned by the project lead. Implemented by the activity agent.**

---

## Depends on

- `chapter-format` — the JSON it reads
- `story-pack` — where it gets character art and speaker names
- A rendered board and characters from the presentation layer

Does **not** depend on rules. Chapter 1 has no pieces. Rules arrive with
chapter 3.

---

## The sequence

```
1. Load chapter JSON
2. Render board per chapter.board
3. Place characters per chapter.characters
4. Play chapter.open
5. For each tap:
     a. Play tap.lead
     b. Show tap.prompt  (narrated)
     c. Wait for a tap on the board
     d. Classify: right, or which wrong
     e. Serve the tier for this attempt
     f. If resolved, next tap. Else back to (c).
6. Play chapter.celebration
7. Emit complete(chapter.id)
```

Nothing else. No score, no timer, no branching.

---

## The tap ladder

The runtime keeps an attempt counter **per tap**. It resets when the tap
resolves and is never stored.

| Attempt | Outcome |
|---|---|
| Any | Correct → play `right`, resolve |
| 1st wrong | Play one `wrong` entry |
| 2nd wrong | Play a **different** `wrong` entry |
| 3rd wrong | Play `plain` |
| 4th wrong | Play `show`, **resolve** |

**Classified first.** On a wrong tap, check `wrong` entries with a `match` in
order. First that fits, play it. If none fit, pick from the unmatched pool —
excluding whichever was played last time.

**A classified entry may repeat.** If the child taps the same wrong square
twice, the same classified entry fires twice. Correct information said again
beats a random joke that does not fit the square. The "different entry" rule
applies only to the random pool.

**A tap may have no random pool.** Chapter 1 tap 1 is fully classified. That
is valid. The converter checks that classified entries plus the pool together
leave no wrong tap without a response.

**Show resolves the tap.** It emits the same completion as a correct tap.
Nothing downstream distinguishes them.

**No fifth attempt exists.** The runtime cannot present a fifth prompt for
the same tap.

---

## Classifying a tap

The runtime receives a tap — a square, or a choice on a picture screen. It
checks it against `tap.target` to decide right or wrong, then against the
`wrong` entries in order to decide which response to play.

Both use the same match vocabulary, defined in `chapter-format.md`:
`square`, `colour`, `adjacent`, `relation`, `blocked`, `piece`, `offBoard`,
`choice`, `fallback`.

**Order is significant.** Entries are checked top to bottom and the first
match wins. `fallback` matches everything, so it must be last — the
converter enforces this, and the runtime may assume it.

Square colour: `(file + rank) % 2 === 0` is dark, where a1 is file 0 rank 0.
h1 is light.

`relation` is computed against the origin square — the piece being moved, or
the character named in the tap. A square is `slant` if it shares a diagonal,
`hallway` if it shares a rank or file, `L` if it is a knight's move away.

`blocked` means on the correct line but with a piece between. It needs the
board, not just the two squares.

Later kinds arrive with the capabilities they need. `any-legal` is the first
that calls into rules, at chapter 3.

## Playing lines

A line sequence plays one at a time.

- **Speaker lines** appear as text near the character. They advance on tap
  anywhere, or after a pause proportional to length if the child does
  nothing. Never faster than a slow reader.
- **Stage lines** trigger an animation if the pack provides one, otherwise a
  short pause. A `pose` field changes which character image renders, and
  persists until changed.
- **Prompts** are narrated via speech synthesis and stay on screen until the
  tap resolves.
- **Pause** lines wait the stated milliseconds.

The child can always tap through dialogue. They can never skip a prompt.

---

## The celebration

Plays after the last tap resolves.

The GIF plays **twice**, then rests on its final frame. The double play is
baked into the file, not requested at runtime — browser handling of finite
loop counts is inconsistent.

The final frame stays on screen until the child taps. **Nothing is timed.**
There is no auto-advance.

Because the last frame is what a child sits with, every celebration ends on a
resting pose. That is an art constraint recorded in `story-pack.md`.

---

## Feel constraints

Binding on the runtime.

- Nothing is timed. The prompt waits forever.
- A tap on a non-square does nothing. No error, no sound.
- A wrong tap gets dialogue, not a visual rejection. No red, no shake.
- The correct square, once tapped or shown, gets a brief highlight in the
  `pip` token colour.
- Motion respects `prefers-reduced-motion` — reduce to instant, never remove
  the feedback.

---

## What the runtime does not know

- Which story it is playing. It has speaker keys and asks the pack for art.
- Whether the board has pieces. Chapter 1 does not.
- Chess rules. Nothing here calls the rules layer until `any-legal`.
- How many attempts a tap took. The counter dies with the tap.
- What the next chapter is. It emits `complete` and stops.

---

## Interface

```ts
type ActivityHandle = {
  start(): void;
  onComplete(cb: (chapterId: string) => void): void;
  abort(): void;         // the menu was used; leave cleanly
};

function playChapter(
  chapter: Chapter,       // parsed JSON
  pack: StoryPack,        // art, speaker names
  mount: HTMLElement      // where to render
): ActivityHandle;
```

`abort` exists because the discreet menu can pull a child out mid-chapter.
Progress is not recorded on abort.

---

## Tests the implementation must pass

- Four taps, each answered correctly first time, completes and emits once.
- A tap answered wrong four times plays wrong, wrong (different), plain,
  show, and resolves.
- Two wrongs never play the same random entry consecutively.
- A classified wrong fires when its match fits, and not when it does not.
- The same classified entry fires twice if the same wrong square is tapped
  twice.
- Show resolves the tap and the next tap begins.
- `abort` mid-chapter emits no completion.
- The attempt counter is not observable after a tap resolves.
