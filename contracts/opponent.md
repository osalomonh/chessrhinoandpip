# Contract · opponent  *(draft)*

Sleepy, Hungry, and Clever. Three friends, each with a weakness a child can
find.

**Status: draft.** Not needed until free play.

---

## What it will cover

- `chooseMove(position, who): Move` — pure, no mutation
- **Sleepy** — takes something only if it is free and adjacent; otherwise
  moves nearly at random
- **Hungry** — always takes the most valuable piece available, even into a
  recapture
- **Clever** — minimax two ply with material count, one deliberate blind spot
- The thinking pause — scales with strength, 400ms to 1200ms, so the opponent
  feels present rather than instant
- The ranking picture — eyes shut, eyes on the food, eyes wide. A child picks
  by picture, never by word.

## What it will not cover

- Rendering the friends. That is the story pack and presentation.
- Whose turn it is. That is session.

## Depends on

`rules`.

## Open

- Clever's blind spot. Should be the skill a recent chapter taught —
  probably never making an escape square for the king, so the back-rank idea
  from chapter 13 is what beats it.
- Whether the three appear during Series 1 or only after chapter 16.
