# Scrubbable preview player — research

Question: can we make the Freesound preview scrubbable (click/drag on the waveform to
move the playhead), and what's the cheapest viable way? Probed 2026-07-17.

Probe target: `https://cdn.freesound.org/previews/587/587634_2214720-hq.mp3`
(unauthenticated, extracted from the public sound page `https://freesound.org/s/587634/`;
same host/path shape the API's `previews["preview-hq-mp3"]` returns).

## 1. Seeking on preview files — YES

The CDN honors Range requests. Verbatim headers:

**Plain `HEAD`** → `HTTP/1.1 200 OK`

```
Accept-Ranges: bytes
Content-Type: audio/mpeg
Content-Length: 75338
Server: nginx/1.30.3
```

**`GET` with `Range: bytes=0-1023` and `Origin: http://localhost:5173`** → `HTTP/1.1 206 Partial Content`

```
Content-Range: bytes 0-1023/75338
Content-Length: 1024
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range
Access-Control-Expose-Headers: Content-Length,Content-Range
```

`Accept-Ranges: bytes` + 206 means a plain `HTMLAudioElement` can seek anywhere in the
preview, including un-buffered regions. This also satisfies Apple's documented server
requirement for iOS media ("HTTP servers hosting media files for iOS must support
byte-range requests" — Safari HTML5 Audio and Video Guide, "Configuring Your Server").

Freesound API docs on previews (https://freesound.org/docs/api/resources_apiv2.html):

> "Dictionary containing the URIs for mp3 and ogg versions of the sound. The dictionary
> includes the fields `preview-hq-mp3` and `preview-lq-mp3` (for ~128kbps quality and
> ~64kbps quality mp3 respectively), and `preview-hq-ogg` and `preview-lq-ogg`"

Previews are served token-free from the CDN (verified above).

## 2. CORS on preview media files — YES

`Access-Control-Allow-Origin: *` is present on the media file responses (see headers
above), and `Range` is explicitly in `Access-Control-Allow-Headers`, with
`Content-Range` exposed. So the Web Audio path — `fetch()` + `decodeAudioData()` for
real client-rendered waveforms, wavesurfer-style — is fully possible from the browser.
(API JSON endpoints already verified as ACAO:* separately; this confirms the media too.)

## 3. Library vs hand-rolled

### wavesurfer.js v7 (v7.12.10)

- **Size**: `dist/wavesurfer.min.js` from unpkg measured locally: **42,953 B minified,
  12,222 B gzipped** (~42 kB / ~12 kB) for the core, zero runtime deps. Plugins extra.
- **CORS**: needs CORS-fetchable audio to decode/draw (satisfied here, per §2). Its
  troubleshooting docs (https://wavesurfer.xyz/docs/troubleshooting/): "The workaround
  is to supply **pre-decoded peaks** so that the waveform renders immediately from
  server-generated data — no download or decode step needed."
- **Pre-rendered data**: yes — options from `src/wavesurfer.ts`
  (https://github.com/katspaugh/wavesurfer.js/blob/main/src/wavesurfer.ts):
  `peaks?: Array<Float32Array | number[]>` ("Pre-computed audio data"), `duration?:
  number` ("Pre-computed audio duration in seconds"), `media?: HTMLMediaElement` ("Use
  an existing media element instead of creating one"), `backend?: 'WebAudio' |
  'MediaElement'` (default MediaElement). It cannot draw from an *image*, only from
  peaks or decoded audio. It CAN wrap our existing shared `Audio` element via `media`.
- **Framework fit**: plain ES module, framework-agnostic; works fine from a Preact
  component (instantiate in a ref'd container, destroy on unmount).

### peaks.js (BBC)

Bundlephobia for `peaks.js@3.4.2`: 109,593 B minified / 23,163 B gzipped — **plus peer
dependencies `konva` and `waveform-data`** (Konva alone is larger than all of
wavesurfer). Designed around precomputed waveform data from BBC's `audiowaveform` tool
(server-side) or client-side Web Audio decoding; dual zoomable/overview views. Heavy
overkill for a card-sized scrub bar. https://github.com/bbc/peaks.js

### Hand-rolled overlay on the existing `waveform_m` PNG — cheapest, fully viable

Click maps `offsetX / width → fraction × sound.duration → audio.currentTime`; drag is
the same math on pointermove with `setPointerCapture`. Progress indicator driven by
`timeupdate` (or rAF while playing for smoothness).

- **PNG spans full width, no horizontal padding.** Freesound's generator
  (https://github.com/MTG/freesound, `utils/audioprocessing/processing.py`,
  `create_wave_images`): `samples_per_pixel = processor.nframes / float(image_width)`
  and it draws peaks `for x in range(image_width)` — the audio timeline maps 1:1 onto
  the full image width. Only a 4 px *vertical* margin exists (`peaks * (image_height - 4)`).
  Sizes from `utils/audioprocessing/freesound_audio_processing.py`: **M = 195×101,
  L = 780×301**. So `offsetX / clientWidth` is an exact time fraction.
- **`timeupdate` frequency** (MDN,
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event):
  > "The event frequency is dependent on the system load, but will be thrown between
  > about 4Hz and 66Hz (assuming the event handlers don't take longer than 250ms to run)."
  In practice ~4 Hz in most browsers — choppy on a 195 px waveform, so use
  `requestAnimationFrame` reading `audio.currentTime` while playing.
- **Setting `currentTime` before metadata** — spec-defined, safe (WHATWG HTML,
  https://html.spec.whatwg.org/multipage/media.html#dom-media-currenttime):
  > "On setting, if the media element's readyState is HAVE_NOTHING, then it must set the
  > media element's default playback start position to the new value; otherwise, it must
  > set the official playback position to the new value and then seek to the new value."
  And once metadata arrives: "If the media element's default playback start position is
  greater than zero, then seek to that time". So clicking the waveform before the mp3
  has loaded still works: set `currentTime` (queued as default start position), then
  `play()`. One nuance: with `readyState` at `HAVE_NOTHING` the *getter* returns the
  queued value, so the progress overlay stays consistent. We already know the duration
  from API metadata (`sound.duration`), so we never need to wait for `loadedmetadata`
  to do the fraction→seconds math. MDN's `currentTime` page adds that Firefox may round
  reads to 2 ms (`privacy.reduceTimerPrecision`) — irrelevant at this UI scale.
- **iOS Safari**: seeking un-buffered mp3s works only if the server supports byte
  ranges (Apple's documented requirement, satisfied per §1). Historic WebKit flakiness
  around seeking before any data has loaded is exactly the case the spec's
  default-playback-start-position queueing covers; belt-and-braces is to re-assert
  `currentTime` once on `loadedmetadata` if `Math.abs(actual - wanted) > 0.5`.
- **`preservesPitch`**: irrelevant — it only affects `playbackRate` changes, not seeks.

## 4. Transient/onset snapping — feasible via the API, no PCM needed

The Freesound Sound Analysis resource (`/apiv2/sounds/<id>/analysis/`,
https://freesound.org/docs/api/resources_apiv2.html) exposes onsets directly:

> "`onset_count` (integer, yes filtering): Number of detected onsets in the audio signal."
> "`onset_times` (array[numeric], no filtering): Timestamps for the detected onsets in
> the audio signal in seconds, which can vary according to the amount of onsets"

So snap-to-transient does NOT require decoded PCM (which would have been fine anyway,
per §2): request `fields=analysis` with `descriptors=rhythm.onset_times`-style filtering
(or fetch the analysis sub-resource) and snap the click fraction to the nearest onset
time. Verdict: cheap server-side data, one extra field per sound; entirely feasible as a
later enhancement. Only caveat: analysis can be missing for some sounds (the docs note
analysis availability varies), so snapping must degrade to raw position.

## Recommended option ladder (cheapest viable → richest)

1. **Hand-rolled overlay on `waveform_m`** — wrap the existing `<img>` in a
   `position:relative` container; add a progress div + pointerdown/move/up handlers;
   extend `src/lib/player.ts` with `seek(id, seconds)` (and expose a `progress` signal
   driven by rAF while playing). No new deps, no fetch changes. Exact mapping is valid
   because the PNG has zero horizontal padding. ~1 small ticket.
2. **Ladder 1 + onset snapping** — fetch `analysis` onset_times per sound (or via
   `fields=` on search), snap clicks when data exists. One API-shape ticket + one UI
   ticket.
3. **wavesurfer.js v7 with `media:` our shared Audio element** — real rendered
   waveform, ~12 kB gzip, `backend: 'MediaElement'`, either let it decode via CORS
   fetch (works, per §2 — costs a full mp3 download per card) or keep drawing cheap by
   passing `peaks` we decode lazily. Replaces the PNG; biggest visual upgrade, and drag
   scrubbing comes built in.
4. **peaks.js** — not recommended here: bigger (110 kB + Konva + waveform-data peers)
   and its zoomable dual-view model outstrips a card-sized scrubber.

Open items needing a live in-app test: none blocking — headers are verified from the
real CDN. Worth a quick device check only for iOS Safari drag behavior (pointer events
on the image) once ladder 1 lands.
