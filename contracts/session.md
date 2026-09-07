# Contract · session  *(draft)*

One free-play game in progress. Turn, orientation, result, and the loop
between the child's move and the opponent's.

**Status: draft.** Not needed until free play.

---

## What it will cover

- Game state: position, whose turn, the child's colour, which friend is the
  opponent
- The move loop: child taps piece, taps destination, session validates via
  rules, applies, hands to opponent, waits the thinking pause, applies the
  reply
- End detection via `rules.status`
- Board orientation — flipped in presentation for a black-playing child,
  never in state
- Promotion prompt — the four pictures, no fish

## How it relates to activity

A free-play game is an activity with a different content shape. The runtime's
line playback, tap handling, and feel constraints are shared. What differs is
that there is no script — the "prompt" is whose turn it is, and the "tap" is
a move.

The activity contract gains a second activity kind when this is built.

## Depends on

`rules`, `opponent`, `activity`.
