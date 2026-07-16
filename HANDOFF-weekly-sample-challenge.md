# Handoff: Weekly Sample Challenge SPA ("Cotygodniowy Flip")

## Purpose

A lightweight single-page web app for a two-person weekly motivational challenge:
each week, a deterministic "random" set of a few Freesound samples is generated.
Both participants (Michał + friend) must get the **identical** set without any
shared backend — the set is a pure function of `(week, filter parameters)`.
Each person then makes a short track from the samples.

## Core concept: deterministic seeded picks

The Freesound API has **no random sort**. Randomness is faked client-side:

1. Build a **canonical filter string** from UI parameters (fixed key order,
   normalized values — critical, since the seed derives from it).
2. `GET https://freesound.org/apiv2/search/?query=&filter=<F>&page_size=1&fields=id&token=<KEY>`
   → read `count` from the response.
3. Seed a small PRNG (e.g. mulberry32 or xmur3+mulberry32) with
   `hash(isoWeekString + "|" + canonicalFilterString)`, e.g. `"2026-W29|duration:[1 TO 10] type:wav"`.
4. Draw N **distinct** indices in `[0, min(count, INDEX_CAP))`.
   - `INDEX_CAP`: defensively cap at ~10 000; Solr-backed APIs often degrade or
     limit deep pagination. Verify empirically; lower if requests fail.
5. For each index: `page = floor(idx / 150) + 1`, `offset = idx % 150`,
   fetch with `page_size=150` and a `sort` that is stable (use `created_asc` —
   **do not** rely on default `sort=score` for an empty query being stable).
   Group draws by page to minimize requests (N samples usually ≤ N requests, often fewer).
6. Fetch `fields=id,name,username,license,duration,tags,url,previews,images,type,samplerate`.

Result: same week + same filters → same sample set on any machine. Sharing is
stateless: encode all state in URL query params ("copy set link" button).

## Freesound API essentials (verified against official docs, July 2026)

- Base: `GET https://freesound.org/apiv2/search/` (the old `/search/text/` endpoint was deprecated Nov 2025 and redirects here).
- Auth: token-based (`&token=API_KEY`) suffices for **search and previews**.
  Original-quality downloads require OAuth2 — **out of scope for v1**; preview
  mp3/ogg files are plain public URLs and are good enough for the challenge.
- Every result's `previews` dict: `preview-hq-mp3` (~128 kbps), `preview-lq-mp3`,
  `preview-hq-ogg` (~192 kbps), `preview-lq-ogg`. `images` dict has waveform/spectrogram PNGs.
- Empty `query=` returns the whole database, so filter-only queries are valid.
- Pagination: `page`, `page_size` (max 150), response has `count`, `next`, `previous`, `results`.
- Rate limiting: 429 with `detail` field when throttled. Default limits are fine
  for this use; still, debounce the count request and cache `(filterString → count)` per session.
- Filter syntax is Solr-like: `filter=duration:[1 TO 10] type:(wav OR aiff) tag:field-recording`
  (uppercase `TO`; multi-word values in double quotes; AND/OR and parentheses supported).

### Filters to expose in the UI (all confirmed filterable)

Metadata: `tag`, `query` (free text), `duration` (range, seconds), `type`
(wav/aiff/ogg/mp3/m4a/flac), `samplerate`, `channels`, `license`
("Attribution", "Attribution NonCommercial", "Creative Commons 0"),
`created` (date ranges, supports `NOW-1YEAR` math), `avg_rating`,
`category` / `subcategory` (Broad Sound Taxonomy), `is_geotagged`, geospatial
(`{!geofilt sfield=geotag pt=<lat>,<lon> d=<km>}` — fun optional "recorded near X" mode).

Content descriptors (auto-extracted, directly filterable): `bpm`, `note_name`
(e.g. "A4"), `note_midi`, `tonality` (e.g. `tonality:"C minor"`),
`pitch` (Hz ranges), `loudness` (LUFS), `loopable` (bool), `single_event` (bool),
`reverbness` (bool), plus perceptual scalars: `brightness`, `warmth`, `hardness`,
`boominess`, `roughness`, `sharpness`, `depth`, `log_attack_time`, `spectral_flatness`.
Descriptor estimates are approximate — treat confidence fields
(`note_confidence`, `tonality_confidence`, `bpm_confidence`) as optional extra filters.

Bonus endpoint (v2 idea): `similar_to=<sound_id>` search param — LAION-CLAP
semantic similarity ("this week: 5 sounds similar to sample X").

## UI spec

Two-pane layout (desktop-first, but keep it usable on mobile — stack panes):

**Left pane — controls column:**
- Week/seed picker: ISO week selector defaulting to current week (e.g. `2026-W29`),
  with prev/next arrows. Optional free-text "salt" field for rerolls that both
  parties agree on (salt is part of the seed and of the shareable URL).
- Sample count: 3–6 (default 4).
- Duration range slider (e.g. 0.5–30 s, log scale feels better).
- File type multi-select; license select; free-text query; tag input.
- Collapsible "Advanced" section: tonality/key select, loopable / single_event
  toggles, perceptual sliders (brightness, warmth…), min rating, date range,
  geo mode (lat/lon + radius, "use my location" via Geolocation API).
- API key input (stored in `localStorage`; shown once, masked after). Link to
  https://freesound.org/apiv2/apply for getting a key.
- "Generate set" button + "Copy set link" button.

**Right pane — results list:**
- One card per sample: play/pause button wired to a single shared `<audio>`
  element (only one plays at a time), waveform image (`images.waveform_m`),
  name, username, duration, type/samplerate, license badge, tags (first few),
  link to the Freesound page (`url`), and a "download preview" anchor
  (preview-hq-mp3, `download` attribute — note it's the lossy preview).
- Loading skeletons while fetching; clear error states (bad key, 429, zero results).
- Zero-results guidance: "filters too narrow — count is 0, loosen duration/tags."

## Tech choices

- Keep it genuinely lightweight: **Vite + vanilla TS** or **Preact**. No state
  library; URL query params are the source of truth for all filter/seed state
  (parse on load, update via `history.replaceState`).
- No backend. Freesound APIv2 supports CORS for token GET requests — verify
  with a quick fetch early; if CORS turns out to be blocked for some resource,
  fall back to a tiny proxy (but previews themselves are public static files).
- Note: the API token is exposed client-side. Acceptable for a personal
  two-user tool; mention in README, don't commit the key.
- Deploy target: static hosting (GitHub Pages / any nginx — Michał runs his own).

## Implementation order

1. Skeleton layout + URL-state module + canonical filter-string builder (pure,
   unit-testable — this function's stability is what guarantees identical sets).
2. Freesound client: count query → seeded index draw → page fetches. PRNG module.
3. Results rendering + audio player.
4. Advanced filters, geo mode, polish, README (incl. "how we agreed the rules" section).

## Open decisions / verify during build

- Confirm real-world deep-pagination behavior and set `INDEX_CAP` accordingly.
- Confirm `created_asc` ordering is stable enough between the two users' fetches
  (new uploads shift nothing at the front for `created_asc` — that's why it was
  chosen over `score`; indices near `count` may drift slightly within a week as
  new sounds are added → consider capping draws to `count` as of Monday, or just
  accept tiny drift and compare sets via the shared URL anyway).
- Whether to add a "lock this set" export (JSON of sound IDs) as the ultimate
  tie-breaker if counts drift mid-week.
