/**
 * The shared audio player: one Audio element for the whole app, so
 * starting a sample always stops the previous one. Deep module — the
 * interface is three names; the element lifecycle, the pause/error/ended
 * sync rules, and the play-rejection race live in the implementation.
 *
 * Deliberately domain-free: callers pass an id and a source URL; this
 * module knows nothing about Freesound sounds or preview variants.
 */

import { effect, signal, type ReadonlySignal } from "@preact/signals";

const playingIdSignal = signal<number | null>(null);

/** Which id is playing right now, or null. Readonly to callers. */
export const playingId: ReadonlySignal<number | null> = playingIdSignal;

const positionSignal = signal(0);

/**
 * Playback position of the playing id, in seconds. Driven by rAF while
 * playing — `timeupdate` can fire as slowly as ~4 Hz, too choppy for a
 * playhead. Meaningless (stale) while `playingId` is null.
 */
export const position: ReadonlySignal<number> = positionSignal;

const rateSignal = signal(1);
const preservePitchSignal = signal(false);

/** Playback speed multiplier (1 = normal). Global and sticky across sounds. */
export const rate: ReadonlySignal<number> = rateSignal;

/**
 * Whether pitch is held constant when the speed changes. `false` (default)
 * is vinyl/tape behaviour — pitch shifts with speed; `true` is time-stretch.
 */
export const preservePitch: ReadonlySignal<boolean> = preservePitchSignal;

const audio = new Audio();
// Vinyl by default (browser default is true = constant pitch).
audio.preservesPitch = false;

let rafId = 0;
effect(() => {
  cancelAnimationFrame(rafId);
  if (playingIdSignal.value === null) return;
  const tick = () => {
    positionSignal.value = audio.currentTime;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
});

// Belt-and-braces from the research doc: a seek issued at HAVE_NOTHING is
// queued by the spec as the default playback start position, but historic
// WebKit builds have dropped it — re-assert once metadata arrives.
let pendingSeek: number | null = null;
audio.addEventListener("loadedmetadata", () => {
  if (pendingSeek !== null && Math.abs(audio.currentTime - pendingSeek) > 0.5) {
    audio.currentTime = pendingSeek;
  }
  pendingSeek = null;
});

// `pause` also fires on ended and on OS-level pauses (media keys); the
// paused check keeps a queued event from clearing a just-started track.
const syncFromAudio = () => {
  if (audio.paused) playingIdSignal.value = null;
};
audio.addEventListener("ended", syncFromAudio);
audio.addEventListener("pause", syncFromAudio);
audio.addEventListener("error", () => {
  playingIdSignal.value = null;
});

export function stop(): void {
  audio.pause();
  playingIdSignal.value = null;
}

/** Swap the source and start playing as `id`. Clears any seek queued for
 * the previous source — without this, a pre-load seek on track A would be
 * re-asserted onto track B's loadedmetadata. */
function start(id: number, src: string): void {
  pendingSeek = null;
  audio.src = src;
  // A load resets playbackRate to defaultPlaybackRate (spec §4.8.11.8), so
  // re-assert rate + pitch after the src swap to keep them sticky.
  applyRate();
  playingIdSignal.value = id;
  audio.play().catch(() => {
    if (playingIdSignal.value === id) playingIdSignal.value = null;
  });
}

function applyRate(): void {
  audio.defaultPlaybackRate = rateSignal.value;
  audio.playbackRate = rateSignal.value;
  audio.preservesPitch = preservePitchSignal.value;
}

/** Set the global playback speed; takes effect immediately mid-play. */
export function setRate(n: number): void {
  rateSignal.value = n;
  applyRate();
}

/** Toggle constant-pitch (`true`) vs vinyl pitch-shift (`false`). */
export function setPreservePitch(on: boolean): void {
  preservePitchSignal.value = on;
  audio.preservesPitch = on;
}

/** Play `src` as `id`; if `id` is already playing, stop instead. */
export function toggle(id: number, src: string): void {
  if (playingIdSignal.value === id) {
    stop();
    return;
  }
  positionSignal.value = 0;
  start(id, src);
}

/**
 * Move the playhead of `id` to `seconds`, starting playback of `src`
 * there if `id` isn't already playing. Safe before the file has loaded:
 * the seek is queued as the start position (and re-asserted on
 * loadedmetadata for old-WebKit safety).
 */
export function seekTo(id: number, src: string, seconds: number): void {
  if (playingIdSignal.value !== id) start(id, src);
  audio.currentTime = seconds;
  if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) pendingSeek = seconds;
  positionSignal.value = seconds;
}
