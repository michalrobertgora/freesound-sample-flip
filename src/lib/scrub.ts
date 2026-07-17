/**
 * Pure scrub math for the waveform scrubber. The waveform_m PNG maps the
 * audio 1:1 across its full width (no horizontal padding — verified in
 * docs/research/scrubbable-preview-player.md), so a pointer fraction of
 * the rendered width IS the time fraction.
 */

/** Pointer x → fraction of the element width, clamped to [0, 1]. */
export function pointerFraction(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
): number {
  if (rectWidth <= 0) return 0;
  return Math.min(1, Math.max(0, (clientX - rectLeft) / rectWidth));
}

/**
 * Snap `seconds` to the nearest onset strictly within `windowSec`, or
 * return it untouched — including when onsets are missing (analysis
 * unavailable for the sound), so scrubbing degrades to free seeking.
 */
export function snapToOnset(
  seconds: number,
  onsets: readonly number[] | null | undefined,
  windowSec: number,
): number {
  if (!onsets || onsets.length === 0) return seconds;
  let best = seconds;
  let bestDist = windowSec;
  for (const t of onsets) {
    const d = Math.abs(t - seconds);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}
