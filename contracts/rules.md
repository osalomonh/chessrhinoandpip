# Contract · rules  *(draft)*

Legal moves, position, result. chess.js wrapped in our vocabulary so nothing
above this layer imports a third-party API directly.

**Status: draft.** Not needed until chapter 3.

---

## What it will cover

- Wrapping chess.js so consumers call `legalMoves(position, square)` rather
  than `chess.moves()`
- Small floors as cropped 8×8 — one engine; presentation hides unused squares
- `status(position)` returning playing, check, checkmate, stalemate, draw
- Full legality including castling, en passant, promotion

## What it will not cover

- Whose turn it is in a *story* sense. Turn order is a rules fact; "it is
  Pip's go" is a story fact.
- Move choice. That is opponent.

## Depends on

Nothing. It is the bottom of the stack.

## Needed by

`activity`, once the `any-legal` target kind exists (chapter 3). `opponent`
and `session`, for free play.

## Licence

chess.js is BSD-2-Clause. Attribution goes in the README and on the About
page.
