/**
 * The shared audio player: one Audio element for the whole app, so
 * starting a sample always stops the previous one. Deep module — the
 * interface is three names; the element lifecycle, the pause/error/ended
 * sync rules, and the play-rejection race live in the implementation.
 *
 * Deliberately domain-free: callers pass an id and a source URL; this
 * module knows nothing about Freesound sounds or preview variants.
 */

import { signal, type ReadonlySignal } from "@preact/signals";

const playingIdSignal = signal<number | null>(null);

/** Which id is playing right now, or null. Readonly to callers. */
export const playingId: ReadonlySignal<number | null> = playingIdSignal;

const audio = new Audio();

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

/** Play `src` as `id`; if `id` is already playing, stop instead. */
export function toggle(id: number, src: string): void {
  if (playingIdSignal.value === id) {
    stop();
    return;
  }
  audio.src = src;
  playingIdSignal.value = id;
  audio.play().catch(() => {
    if (playingIdSignal.value === id) playingIdSignal.value = null;
  });
}
