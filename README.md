# Cotygodniowy Flip

A weekly sample challenge for two people. Every week, both of us get the
**same** "random" set of Freesound samples — without a shared backend, without
coordinating — and each makes a short track from them. This app is the referee.

Open the app, see this week's set, make music. That's the ritual.

## The rules (as we agreed them)

- **Weeks are ISO weeks and start on Monday.** Generate on Sunday evening and
  you get the *previous* week — that's by design, not a bug. Week 1 is the week
  containing January 4th; some years (like 2026) have 53 weeks.
- **The first person to generate defines the week's set.** Generate, press
  **Copy set link**, send it. The link pins the exact sound IDs, so whatever
  drifts in Freesound's database afterwards, the recipient sees the same
  sounds in the same order. A link is a contract.
- **Same URL ⇒ same set.** The set is a pure function of
  `(week, salt, sample count, filters)`. If we both open the same URL and
  generate, we get identical results on both machines.
- **Rerolls are salted.** If we both hate a set, we agree on a salt
  (e.g. `take2`), both type it in, and get a fresh — still identical — set.
- **Previews, not originals.** Cards play and download the HQ MP3 preview
  (lossy). For the original file, follow the card's link to Freesound.

## How the determinism works

**Seeded mode** (no `ids` in the URL): the app asks Freesound how many sounds
match the filters, floors that count to two significant figures (so mid-week
uploads rarely change it), seeds a PRNG with
`week|salt|sampleCount|query|canonicalFilter`, draws N distinct indices, and
fetches those positions from the result list sorted oldest-first (append-only,
so positions are stable). Every part of that pipeline is pinned by
golden-value tests — it must produce byte-identical results on every machine,
or the whole idea collapses.

**Locked mode** (`ids=` in the URL): the seeded pipeline is bypassed entirely;
the app fetches exactly those sounds in one request and shows them in the
original draw order. This is why count drift ultimately doesn't matter: the
moment someone shares a set link, the set is nailed down by ID. If a sound has
been deleted from Freesound since, its slot shows an explicit "removed"
placeholder rather than silently shrinking the set.

Changing any control while a locked set is shown clears the lock — the
controls and the set are never allowed to silently disagree.

## Getting an API key

1. Create a Freesound account and apply for an API key at
   <https://freesound.org/apiv2/apply/> (instant, free).
2. Paste the key (the *Client secret/Api key* value) into the app's key field.

The key is stored **only in your browser's localStorage**. It is never part of
the URL, never in a copied set link, and must never be committed to this repo.
Each participant needs their own key — a shared set link is not self-contained.
This client-side-token setup is acceptable because this is a personal
two-person tool; don't reuse the pattern for anything public.

## Development

```sh
npm install
npm run dev    # local dev server
npm test       # vitest (pure modules + the set-resolution seam)
npm run build  # typecheck + production build into dist/
```

The determinism-critical modules (`src/lib/prng.ts`, `src/lib/filters.ts`)
are a cross-machine contract: any change to the PRNG, the seed-string format,
or canonical filter serialization breaks set parity between users mid-week.
The golden-value tests will fail loudly if you touch them — only change these
deliberately, with both participants updating at the same time.

## Deploying

**Live at <https://michalrobertgora.github.io/freesound-sample-flip/>.**

`npm run build` emits plain static files in `dist/` with relative asset paths
(`base: "./"`), so they work from a domain root **or** any subpath:

- **Any static host / nginx**: copy `dist/` wherever the server can see it.
  No headers, rewrites, or server logic needed.
- **GitHub Pages (current setup)**: every push to `master` runs
  `.github/workflows/deploy.yml` (tests → build → deploy). Nothing manual —
  merge and it ships.

There is no backend and no proxy — the app talks to
`https://freesound.org/apiv2/` directly (CORS is open for token auth).
