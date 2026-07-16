/**
 * Pure display formatting for sound cards. Nothing here touches the
 * seed or filter contracts — presentation only.
 */

/** Longest-match-first so "by-nc-sa" never reads as "by-nc" or "by". */
const LICENSE_BADGES: Array<[needle: string, badge: string]> = [
  ["publicdomain/zero", "CC0"],
  ["licenses/by-nc-sa", "CC-BY-NC-SA"],
  ["licenses/by-nc-nd", "CC-BY-NC-ND"],
  ["licenses/by-nc", "CC-BY-NC"],
  ["licenses/by-sa", "CC-BY-SA"],
  ["licenses/by-nd", "CC-BY-ND"],
  ["licenses/by", "CC-BY"],
  ["licenses/sampling+", "Sampling+"],
];

/** Freesound returns licenses as creativecommons.org URLs; badge them. */
export function licenseLabel(license: string): string {
  for (const [needle, badge] of LICENSE_BADGES) {
    if (license.includes(needle)) return badge;
  }
  return license;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSampleRate(hz: number): string {
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}
