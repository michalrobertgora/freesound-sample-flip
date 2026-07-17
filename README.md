# Freesound Flip

A backend-less single-page app that produces a deterministic weekly set of
[Freesound](https://freesound.org) samples. Opening the same URL on two
machines yields the same set, with no shared server.

Live: <https://michalrobertgora.github.io/freesound-sample-flip/>

## Model

Application state is encoded in the URL query string. There are two resolution
modes.

**Seeded** (no `ids` parameter): the set is a pure function of `week`, `salt`,
`sampleCount`, `query`, and the canonical filter string. The app counts the
sounds matching the filters, floors that count to two significant figures (to
absorb mid-week uploads), seeds a PRNG with
`week|salt|sampleCount|query|canonicalFilter`, draws N distinct indices, and
fetches those positions from results sorted oldest-first (append-only, so
positions are stable). The PRNG, seed-string format, and filter serialization
are pinned by golden-value tests and constitute a cross-machine contract.

**Locked** (`ids` present): the seeded pipeline is bypassed. The listed sound
IDs are fetched in a single request and shown in the given order; a sound
deleted from Freesound renders as a placeholder rather than shrinking the set.
"Copy set link" produces a locked URL.

Weeks are ISO weeks (Monday start; week 1 contains January 4; some years have
53). While a set is locked the filter controls are disabled; the Unlock button
is the only way to return to seeded mode.

## Features

- Filters: query, tags, categories (Broad Sound Taxonomy), file types,
  duration, license, tonality, loopable / single-event, perceptual descriptors
  (brightness, warmth, hardness, boominess), minimum rating, upload-date range,
  and a geolocation radius.
- Preview player: a single shared audio element; click or drag the waveform to
  seek (with onset snapping where analysis data exists); speed presets
  0.25×–2× with re-pitch or constant pitch.
- Light and dark themes.

Sample originals are not downloaded in-app. Each card links to the sound's
Freesound page, where a free account can download the lossless original; the
in-app player uses the lossy MP3 preview.

## Architecture

- Preact, `@preact/signals`, Vite, Vitest, TypeScript.
- No user API key. JSON API requests (search, count, analysis) are proxied by a
  Cloudflare Worker (`proxy/`) that injects the Freesound token server-side.
  Preview MP3s and waveform images are token-free on the Freesound CDN and are
  loaded directly.
- Static build, deployed to GitHub Pages.

`proxy/README.md` documents the Worker; `CONTEXT.md` is the domain glossary;
`docs/research/` holds the source-backed investigations behind the design
decisions.

## Development

```sh
npm install
npm run dev     # dev server
npm test        # vitest
npm run build   # typecheck + production build to dist/
```

`src/lib/prng.ts` and `src/lib/filters.ts` are the cross-machine contract:
changing the PRNG, the seed-string format, or canonical filter serialization
changes the sets generated from a given URL. The golden-value tests fail on any
such change.

## Deployment

`npm run build` emits static files with relative asset paths (`base: "./"`),
served from a domain root or any subpath. Pushing to `master` runs
`.github/workflows/deploy.yml` (test → build → deploy to Pages).

The API proxy is deployed separately; see `proxy/README.md`.
