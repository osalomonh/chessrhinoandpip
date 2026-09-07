# Contract · shell

The screens that exist and how a child moves between them. This is the top of
the stack; nothing consumes it.

**Owned by the project lead. Implemented by the interface agent.**

---

## Screens

| Screen | Route | What it is |
|---|---|---|
| **Path** | `/` | The landing page and the only home. The floor as a strip. |
| **Chapter** | `/ch01` | A chapter playing. Board, characters, prompt, menu. |
| **About** | `/about` | For parents. |
| Free play | `/play` | *Later.* |
| Free play setup | `/play/setup` | *Later.* |

Routing by URL hash. No server. Refreshing a chapter mid-play returns to the
path — there is no mid-chapter save.

---

## The path

**The path is the floor.** Sixteen squares in a strip, alternating light and
dark, one file of the board laid out as a road.

- The current chapter's square is lit. Done chapters are quiet. Undone
  chapters are quieter.
- Tapping any square enters that chapter. **All are enterable** — free
  movement, forwards and back. Nothing is locked.
- Free play sits at the end of the strip. *Not built for chapter 1; the space
  exists.*
- No title. No text above the strip.

On a tablet the strip runs horizontally and scrolls. On a phone it runs
vertically. Either way the current chapter is on screen on load.

---

## The chapter screen

```
  ┌────────────────────────────────────────┐
  │ ≡                                      │   ← discreet menu
  │                                        │
  │    [Rhino]      [board]      [Pip]     │
  │                                        │
  │       "Tap the light corner."          │   ← prompt, narrated
  │                                        │
  └────────────────────────────────────────┘
```

- The board is the largest thing on screen. Squares at least 64px.
- Characters stand beside the board, on the side the chapter places them.
  Dialogue appears near the speaker.
- The prompt sits below the board. Large type, Lexend. It stays until the tap
  resolves.
- Nothing else. No progress bar, no chapter number, no score.

---

## The celebration screen

Plays after the last tap. The GIF plays twice and rests on its final frame.

**Nothing is timed.** The final frame stays until the child taps, and the tap
returns them to the path. There is no auto-advance and no continue button —
a tap anywhere.

---

## The menu

One icon, top-left, in `rhinoDark` at reduced opacity. It does one thing:
return to the path.

Tapping it mid-chapter aborts cleanly. **No confirmation dialog** — a
six-year-old who tapped it wanted to leave, and the chapter can be replayed.

It must be findable by a child who needs it and invisible to one who does
not.

---

## The footer

Below the path only. Not on the chapter screen.

One line, small, `rhinoDark`: a link to About. That is the only text on the
path.

---

## About

Parent-facing. Plain prose, no marketing voice. In this order:

1. What this is — two friends inventing a game on a floor
2. Who it is for — six to eight
3. That nothing is collected, nothing is tracked, no account exists
4. That the code is open, with a link
5. The chess.js attribution

A parent should finish it in under a minute and feel they were told the
truth.

---

## Landing

Open the URL, you are on the path. No splash, no loading screen, no name
entry, no start button. The current chapter is lit and one tap away.

---

## The word

**"Chess" does not appear in user-facing text.** Not in a title, a menu, a
tooltip, a button, or the page `<title>`. The word appears once, in chapter
16, delivered by the story.

The About page is the exception — it is for parents, and it names the thing
plainly.

---

## What shell does not do

- Play a chapter. It mounts the activity runtime and gets out of the way.
- Know chess. Nothing here calls rules.
- Know Rhino and Pip. It reads the pack manifest and lets the pack draw its
  own path squares.
- Store anything. Progress is a separate layer; shell reads it.
