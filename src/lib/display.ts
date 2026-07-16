/**
 * Pure display formatting for sound cards. Nothing here touches the
 * seed or filter contracts — presentation only.
 */

/** More specific `by-*` variants must precede their prefixes ("by-nc-sa" before "by-nc" before "by"). */
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
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSampleRate(hz: number): string {
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

/** Preferred preview variant: HQ mp3, falling back to whatever exists. */
export function previewUrl(previews: Record<string, string>): string | undefined {
  return previews["preview-hq-mp3"] ?? Object.values(previews)[0];
}
