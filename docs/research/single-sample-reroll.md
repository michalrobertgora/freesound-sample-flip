# Single-sample re-roll (feasibility)

Date: 2026-07-17. Status: **not implemented — feasible if wanted.** This note
records that the feature fits the current model, so it can be picked up later
without rework.

Feature: replace one sound in a generated set with another random sound matching
the same filters, keeping the rest. Rationale: most of a set is usable but one
sound is a dud, and the user wants to swap just that one rather than reroll the
whole set.

## Verdict

Possible without changing the deterministic core. The seed string, PRNG, and
canonical-filter serialization (the golden-test cross-machine contract) are
untouched. The feature rides the existing **locked mode** and the existing
count/draw/page-fetch plumbing.

## Why it fits the model

The app has two resolution modes (`CONTEXT.md`):

- **Seeded** — the set is a pure function of `week|salt|sampleCount|query|canonicalFilter`.
- **Locked** — `ids=` in the URL pins an explicit list of sound IDs, bypassing the
  seeded draw. This mode exists to represent an arbitrary, hand-determined set.

A single-sample re-roll produces exactly such a set: N−1 sounds from the seeded
draw plus one swapped in. So re-rolling one slot is a **seeded → locked
transition** — the same category the app already handles with `ids=`. No new model
concept is required.

## Mechanism (reuses existing code)

`src/lib/resolveSet.ts` already provides everything needed:

- the match `count` is known (live in the UI), and `range = min(quantizeCount(count), INDEX_CAP)`;
- a sound at global index `i` is on page `floor(i / PAGE_SIZE) + 1` at offset
  `i % PAGE_SIZE`, fetched via `buildPageUrl` + `fetchPage`.

A re-roll is then: draw a fresh index in `[0, range)`; fetch that one sound; if its
ID is already in the set or the slot is missing/deleted, redraw; swap it into the
target slot. One extra request per re-roll.

## Determinism and parity

The replacement draw does **not** need to be deterministic across machines. A
re-roll is a local curation action; parity is preserved the existing way — the
curated set is shareable as its `ids=` link, which the other user opens in locked
mode to get the identical result. So the draw can use `Math.random` and the seed
format stays unchanged. (Baking re-rolls into the seed — e.g. a per-slot reroll
counter — *would* be a model change and is unnecessary.)

`copySetLink` already builds the share URL from the currently displayed slots, so
if a re-roll updates the slots signal, the copy/share and history paths capture the
re-rolled set without extra work.

## Impact and effort (moderate-small)

- UI: a per-card re-roll control on `SoundCard`, plus a small `rerollSlot(k)`
  function (draw index → fetch → dedupe by ID → swap).
- History (`src/lib/history.ts`): currently saves on generate; a re-roll would want
  a save hook too.
- Edge cases: duplicate-ID avoidance, retry on a missing/deleted draw, one extra
  fetch per click — all reuse existing plumbing.

## Open design decision (not a blocker)

The only thing to decide before implementing is the interaction with the
explicit-unlock rule (ticket 24: the filter pane greys out and disables while a set
is locked). Options:

1. **Curate in memory** — a re-roll updates only the displayed slots; the set is
   pinned to `ids=` only when copied/shared. Simplest, but a reload loses the
   re-roll.
2. **A lighter "curated" state** — re-rolls persist to the URL but do not freeze the
   filter pane; only opening a shared `ids=` link freezes it.

Either is small. This is a UX/state choice, not a feasibility constraint.
