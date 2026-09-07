# Contract · progress

What is done, what is next, where it lives.

**Owned by the project lead. Implemented by the progress agent.**

---

## Shape

```json
{
  "version": 1,
  "pack": "rhino-and-pip",
  "chapters": {
    "ch01": { "complete": true, "completedAt": "2026-09-06T14:22:00Z" }
  }
}
```

That is everything. A chapter is either complete or absent.

---

## What is deliberately not stored

- **Attempt counts.** Nothing records how many tries a tap took.
- **Time spent.** No session lengths, no durations.
- **Partial progress.** A chapter left halfway is not recorded.
- **Anything about the child.** No name, no age, no device identifier.

Progress is completion, not performance. A child who needed every Show
finishes with the same record as one who needed none.

---

## Storage

`localStorage`, one key: `rhino-and-pip:progress`.

No account. No server. Clearing browser data clears progress, and that is
acceptable for the first release.

---

## Interface

```ts
function load(): Progress;
function markComplete(chapterId: string): void;
function isComplete(chapterId: string): boolean;
function currentChapter(pack: PackManifest): string;
```

`currentChapter` returns the first incomplete chapter, or the last if all are
done. It is what lights the path square. Derived, never stored.

---

## Server-ready

The shape above is what a server would store, unchanged. When accounts
arrive:

- `version` handles migration
- The same `chapters` map syncs
- `load` gains a network path with localStorage as the fallback

No rewrite. Adding sync is adding a transport, not changing a shape.

---

## Legal

Nothing here is personal information. There is no child in the data. That is
deliberate and it is why the product has no account, no consent flow, and no
COPPA surface in the first release.
