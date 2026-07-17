# Playback rate for the preview player

Research on adding variable-speed playback to the shared preview player
(`src/lib/player.ts`, one `HTMLAudioElement`). Sources: MDN Web Docs, WHATWG
HTML Living Standard, Apple developer docs.

Summary: this is a two-property feature — `audio.playbackRate` for speed and
`audio.preservesPitch` for the pitch-shift vs. time-stretch choice. Both are
Baseline (widely available since December 2023). The scrubber needs no change;
`currentTime` advances at the effective rate. The one required piece of work is
keeping the rate sticky across `src` swaps, since a load resets it.

---

## 1. The core API — `HTMLMediaElement.playbackRate`

**What it does / default / range** (MDN, verbatim):

> The **`HTMLMediaElement.playbackRate`** property sets the rate at which the
> media is being played back. This is used to implement user controls for fast
> forward, slow motion, and so forth. The normal playback rate is multiplied by
> this value to obtain the current rate, so a value of 1.0 indicates normal
> speed.

> `1.0` is "normal speed," values lower than `1.0` make the media play slower
> than normal, higher values make it play faster. (**Default:** `1.0`)

> The audio is muted when the fast forward or slow motion is outside a useful
> range (for example, Gecko mutes the sound outside the range `0.25` to `4.0`).

Source: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate>

**Takes effect immediately during playback?** Yes. MDN's companion guide
distinguishes the two properties explicitly:

> `defaultPlaybackRate` allows us to set the playback rate _before_ playing the
> media, while `playbackRate` allows us to change it during media playback.

> There is also an event available called `ratechange`, which fires every time
> the `playbackRate` changes.

Source: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/WebAudio_playbackRate_explained>

**Persist across a `src` change? No.** The rate a freshly loaded resource plays
at comes from `defaultPlaybackRate`, not the last `playbackRate`. MDN:

> we also have a `defaultPlaybackRate` property available, which lets us set the
> default playback rate: the playback rate to which the media resets; for
> example, if we change the source of the video, or (in some browsers) when an
> `ended` event is generated.

WHATWG dev edition, verbatim short-forms:

> `media.defaultPlaybackRate` … returns the default rate of playback
>
> `media.playbackRate` … returns the current rate of playback, where 1.0 is
> normal speed

Source: <https://html.spec.whatwg.org/dev/media.html>,
<https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/defaultPlaybackRate>

**Consequence for our shared element:** our `start()` sets `audio.src = src`,
which triggers a load, which resets `playbackRate` back to `defaultPlaybackRate`
(1.0 unless we set it). So a chosen rate will silently reset on the *next*
sound. Two ways to make it sticky: (a) set `defaultPlaybackRate = n` too, so
loads adopt it, **and/or** (b) re-assert `audio.playbackRate = n` inside
`start()` after assigning `src`. Belt-and-braces: do both (set
`defaultPlaybackRate` for correctness, re-assert `playbackRate` for old-engine
safety, mirroring the existing `pendingSeek` pattern).

**Survives `pause()` / `play()`?** Yes. `pause`/`play` do not reload the
resource, so `playbackRate` is untouched — only a *load* (new `src`) resets it.

---

## 2. Pitch behaviour — `preservesPitch`

MDN, verbatim:

> The **`HTMLMediaElement.preservesPitch`** property determines whether or not
> the browser should adjust the pitch of the audio to compensate for changes to
> the playback rate made by setting `HTMLMediaElement.playbackRate`.

> A boolean value defaulting to `true`.

WHATWG dev edition, verbatim:

> `media.preservesPitch` … returns whether pitch-preserving algorithms are used
> when the `playbackRate` is not 1.0

So:

- **Default (`true`) = time-stretch / constant pitch.** Speed changes, pitch
  stays. (`playbackRate` page: "The pitch of the audio is corrected by
  default.")
- **`preservesPitch = false` = vinyl / turntable behaviour.** Pitch rises and
  falls with speed. MDN: "When set to `false`, the pitch will change along with
  the speed."

For a **sample-digging app** both are legitimately wanted: constant-pitch to
audition a loop faster without transposing it, vinyl-pitch to hear what a
sample sounds like sped-up/slowed-down as producers actually chop it. Cheapest
honest default is the browser default (`preservesPitch = true`, constant pitch);
expose a toggle if the vinyl feel is wanted. Like `playbackRate`, this is a
per-element property and **also worth re-asserting on `src` swap** to be safe,
though it is generally stickier than `playbackRate` across loads.

**Prefixed legacy names:** MDN's current page presents `preservesPitch` as the
standard name and lists it as Baseline. The historically shipped prefixed
aliases were `mozPreservesPitch` (Firefox) and `webkitPreservesPitch`
(Safari/Chrome) — both now superseded by the unprefixed property. A maximally
defensive setter can fall back to them, but for a Baseline-targeting SPA the
unprefixed property alone is fine on current browsers.

Source: <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch>
(Baseline: "widely available … since December 2023")

> Note: the earlier repo note in `docs/research/scrubbable-preview-player.md`
> ("preservesPitch irrelevant — only affects playbackRate changes, not seeks")
> was about **seeking** and remains true for seeks. Here rate is the whole
> point, so `preservesPitch` is directly relevant.

---

## 3. Interaction with the scrubber / `position` tracking

**The rAF playhead stays correct without extra code.** The `position` signal reads
`audio.currentTime` each frame; `currentTime` is the official playback position,
which the spec advances *at* the effective rate (rate = normal × `playbackRate`).
At 2× the clock ticks twice as fast, at 0.5× half as fast, so `position.value /
sound.duration` and the derived `frac` remain the true fraction of the file with
**no code change**. MDN's guide confirms rate is a multiplier on normal playback
and notes it does not otherwise disturb the timeline. The scrubber's
pixel↔seconds mapping in `ResultsPane.tsx` is entirely in file-seconds and is
therefore rate-agnostic.

**No pitfall with the `pendingSeek` / `loadedmetadata` dance.** Rate and seek
position are independent axes: `currentTime` (where) vs `playbackRate` (how
fast). Setting one never perturbs the other. The one ordering caveat is the same
load-reset from §1: if you set `defaultPlaybackRate`/`playbackRate` and then
assign `src`, the load resets `playbackRate` — so the rate re-assert must happen
**after** `audio.src = src` in `start()`, exactly where `pendingSeek` is already
cleared. `seekTo()` needs no change.

Sources (rate as multiplier, muting outside range):
<https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate>,
<https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/WebAudio_playbackRate_explained>

---

## 4. Range limits, negative/zero, support matrix, iOS

**Safe/audible range for mp3 previews.** MDN guide, verbatim:

> Most browsers stop playing audio outside `playbackRate` bounds of 0.5 and 4,
> leaving the video playing silently. For most applications, it's recommended
> that you limit the range to between 0.5 and 4.

And the Gecko-specific mute note from the property page: audio is muted outside
`0.25`–`4.0`. **Verdict: the proposed 0.5 / 0.75 / 1 / 1.5 / 2 preset ladder is
entirely inside the safe, audible band on every engine.** No clamping logic
needed for those values.

**Negative (reverse) playback — effectively NOT usable.** MDN property page:

> A negative `playbackRate` value indicates that the media should be played
> backwards, but support for this is not yet widespread.

MDN guide: "Negative values indicating the media should play in reverse is not
currently supported by most browsers." → **Do not offer reverse.**

**Zero.** `playbackRate = 0` is a stall (no advance), not a documented feature to
expose; treat it as out of range — the preset ladder avoids it.

**Support matrix.** Both `playbackRate` and `preservesPitch` are **Baseline
"widely available"** per MDN — `preservesPitch` since **December 2023** across
Chrome/Edge, Firefox, and Safari; `playbackRate` is far older and universal.

**iOS Safari quirk.** Apple's (archived) HTML5 audio/video guide states,
verbatim:

> You can set the audio or video `playbackRate` property to nonzero values to
> play media in slow motion (values >0 and <1) or fast forward (values >1) in
> Safari on the desktop. Setting `playbackRate` is not currently supported on
> iOS.

Source: <https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html>

That doc is a **legacy archive**; modern iOS Safari (17+, consistent with the
Dec-2023 Baseline for `preservesPitch`) does honour `playbackRate` on
`<audio>`. But older iOS may silently ignore it. **Design implication:** treat
rate as best-effort — if an engine ignores it, the sound still plays at 1× and
nothing breaks. Worth a live on-device check (see uncertainty note).

---

## 5. Design fit for this module

`player.ts` is domain-free and owns the one shared element, so rate belongs on
the same seam as `playingId` / `position`. Smallest addition:

- **A `rate` signal** (default `1`), exported readonly like `position`, plus
  **`setRate(n: number)`** that assigns `audio.playbackRate = n`,
  `audio.defaultPlaybackRate = n`, and updates the signal. Applying it live
  means changing rate mid-play just works (immediate effect, §1).
- **Re-assert in `start()`** after `audio.src = src`:
  `audio.playbackRate = rateSignal.value` (and `defaultPlaybackRate`), so the
  rate persists across sound swaps despite the spec's load-reset. This mirrors
  the existing `pendingSeek = null` line.
- **Rate is sticky, not per-sound.** A digger picks a working speed and keeps it
  across the set; resetting to 1× on every card would fight that. (If a
  per-sound reset is ever wanted, it's a one-liner in `toggle`.)
- **Pitch:** optionally set `audio.preservesPitch` in the same seam — either
  hard-code the default (`true`, constant pitch) or add a `setPreservePitch`
  toggle if the vinyl mode is in scope.

**Component side (a rate control near the Play button in `ResultsPane.tsx`):**
render the preset ladder `[0.5, 0.75, 1, 1.5, 2]`, read `rate.value` to show the
active preset, and call `setRate(n)` on click. Nothing else in the card changes
— the scrubber math is already rate-correct (§3).

### Recommended implementation shape (ticket-ready)

1. In `player.ts`: add `const rateSignal = signal(1)`; export
   `rate: ReadonlySignal<number>` and
   `setRate(n)` → sets `audio.playbackRate`, `audio.defaultPlaybackRate`, and
   `rateSignal.value`.
2. In `start()`, after `audio.src = src`, re-assert
   `audio.playbackRate = rateSignal.value` (and `defaultPlaybackRate`) so rate
   survives the load-reset. Keep it sticky across sounds.
3. (Optional) `audio.preservesPitch = true` at module init, or a
   `setPreservePitch(b)` seam if a vinyl/time-stretch toggle is wanted.
4. In `ResultsPane.tsx`: a small preset control `[0.5, 0.75, 1, 1.5, 2]` near the
   play button, calling `setRate`; highlight the active preset from `rate.value`.
   No scrubber changes.
5. Do **not** expose reverse (unsupported) or 0; the 0.5–2 ladder is fully inside
   the audible range on all engines.

---

## Remaining uncertainty (needs a live in-app test)

- **iOS Safari on older devices:** confirm whether `playbackRate` is honoured on
  a real iOS device (the "not supported on iOS" Apple text is from an archived
  doc; modern iOS should work). Failure mode is benign (plays at 1×), but verify.
- **`preservesPitch = false` audible quality** on the lossy preview mp3 across
  engines — confirm the vinyl pitch-shift actually sounds as expected before
  committing to exposing a pitch toggle.
- **Exact mute thresholds** are engine-specific (Gecko `0.25`–`4.0`); the 0.5–2
  ladder is safely inside, but if future presets push past 2×, re-check muting.
