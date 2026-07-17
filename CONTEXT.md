# CONTEXT.md — Freesound Flip (formerly Cotygodniowy Flip)

Domain glossary for the weekly sample challenge. Use these terms exactly in
issues, tests, and proposals; the *Avoid* notes are deliberate.

## Domain terms

- **Week** — an ISO week string `YYYY-Www` (Monday start; week 1 contains
  Jan 4; some years have 53). The challenge's unit of time.
- **Salt** — a free-text reroll token both participants agree on ("take2");
  part of the seed. Empty and whitespace-only are the same salt.
- **Seed string** — `week|salt|sampleCount|query|canonicalFilter`. The
  **cross-machine contract**: identical inputs must produce this byte-for-byte
  on every machine, pinned by golden-value tests. Change it only deliberately
  and for both participants at once.
- **Canonical filter string** — the deterministic serialization of filters
  (fixed key order, sorted deduped multi-values, quantized numbers). Feeds
  both the seed and the API's `filter=` parameter.
- **Seeded mode** — the default resolution mode: count → quantize → cap →
  seeded draw of indices → pages sorted `created_asc`.
- **Locked set** — a set pinned by explicit sound IDs (`ids=` in the URL);
  bypasses the seeded pipeline entirely. The first person to generate defines
  the week's set. *Avoid:* "saved set", "playlist".
- **Explicit unlock** — while a lock is active the filter pane is disabled
  (greyed), so the pinned set and the controls can't silently diverge. The
  **Unlock** button is the only way to clear a lock; it resets the shown set
  and stops playback via `onLockCleared`. Owned by the app store.
- **Slot** — one position in a resolved set, in draw order: a sound, or a
  **missing sound** placeholder when Freesound deleted it.
- **Count** — the live number of sounds matching the filters. Quantized
  (two-significant-figure floor) before seeding so mid-week uploads rarely
  move the draw range.

## Modules and seams

- **App store** (`src/lib/appStore.ts`) — deep module owning URL-backed app
  state and explicit unlock (see above). Seam: the **URL adapter**
  (browser history in the app, recording fake in tests).
- **Player** (`src/lib/player.ts`) — deep module owning the one shared audio
  element. Interface: `playingId`, `position`, `rate`, `preservePitch`,
  `toggle(id, src)`, `seekTo(id, src, seconds)`, `setRate(n)`,
  `setPreservePitch(on)`, `stop()`. Domain-free. Speed/pitch are global and
  sticky across sounds (re-asserted after each `src` swap).
- **Onsets cache** (`src/lib/onsetsCache.ts`, wired in `src/lib/onsets.ts`) —
  lazy per-sound `onset_times` from the analysis resource, fetched on scrub
  intent, cached per session (404 permanent, other failures retryable).
  Seam: the same Transport shape as every network module.
- **Set resolution** (`src/lib/resolveSet.ts`) — the seam between app state
  and the network: state + transport in, resolved set or typed error out.
- **Transport** (`src/lib/freesound.ts`) — fetch-shaped adapter; real `fetch`
  in the app, fakes in tests. The seam every network test crosses. JSON API
  calls go to the **Worker proxy** (`API_BASE`, override via `VITE_API_BASE`),
  which injects the token server-side — the browser holds no key. Preview mp3s
  and waveform PNGs still load straight from the Freesound CDN (token-free).
- **API proxy** (`proxy/`) — a Cloudflare Worker fronting `/apiv2/search/` and
  `/apiv2/sounds/<id>/analysis/`; deployed separately from Pages. It injects the
  token, so the app requires no API-key entry.
- **Composition root** (`src/app.tsx`) — wiring only: creates nothing but
  connections between the modules above and renders `src/components/`.

*Avoid:* "component"/"service" for modules; "random" for the draw (it is
deterministic); "session" for week.
