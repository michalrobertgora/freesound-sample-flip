/**
 * Canonical filter-string builder.
 *
 * THE stability-critical module: the weekly seed derives from the string
 * built here, so the same UI parameters must produce the same string on
 * every machine, every browser, every time. Rules:
 *   - fixed key order (alphabetical by filter key)
 *   - multi-values sorted alphabetically
 *   - numbers quantized and formatted by `formatNum` (never raw toString)
 *   - free text trimmed, whitespace collapsed, lowercased
 */

export interface GeoPoint {
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface FilterParams {
  /** Free-text query (Freesound `query=` param, not part of `filter=`). */
  query: string;
  tags: string[];
  /** Duration range in seconds; null = unbounded on that side. */
  durationMin: number | null;
  durationMax: number | null;
  /** File types, e.g. ["wav", "aiff"]. */
  types: string[];
  /** License filter value, e.g. "Creative Commons 0". Empty = any. */
  license: string;
  /**
   * Advanced filters (ticket 06). Every default means "no filter", so a
   * state that touches none of these serializes to the exact same
   * canonical string (and seed) as before they existed.
   * Field names live-verified 2026-07-16: unprefixed (`tonality`,
   * `loopable`, `single_event`, `brightness`, …); the `ac_`-prefixed
   * spellings are Solr "undefined field" errors.
   */
  /** Exact value from the tonality select, e.g. "C minor". Case matters. */
  tonality: string;
  loopable: boolean;
  singleEvent: boolean;
  /** Perceptual minimums, 0–100 integers; null = off. */
  brightnessMin: number | null;
  warmthMin: number | null;
  hardnessMin: number | null;
  boominessMin: number | null;
  /** Minimum average rating, 0–5; null = off. */
  ratingMin: number | null;
  /** Upload date range, "YYYY-MM-DD"; null = unbounded. */
  createdFrom: string | null;
  createdTo: string | null;
  /** "Recorded near" geo filter; null = off. */
  geo: GeoPoint | null;
}

export const DEFAULT_FILTERS: FilterParams = {
  query: "",
  tags: [],
  durationMin: 0.5,
  durationMax: 30,
  types: [],
  license: "",
  tonality: "",
  loopable: false,
  singleEvent: false,
  brightnessMin: null,
  warmthMin: null,
  hardnessMin: null,
  boominessMin: null,
  ratingMin: null,
  createdFrom: null,
  createdTo: null,
  geo: null,
};

/** Quantize to 0.1 and format without float noise: 1.5 → "1.5", 3 → "3". */
export function formatNum(n: number): string {
  const q = Math.round(n * 10) / 10;
  return q.toFixed(1).replace(/\.0$/, "");
}

/** Normalize free text: trim, collapse whitespace, lowercase. */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Quote a filter value if it contains whitespace. */
function quoteValue(s: string): string {
  return /\s/.test(s) ? `"${s}"` : s;
}

/** 0–100 perceptual minimum as an integer-quantized range part. */
function minRange(field: string, min: number | null, parts: string[]): void {
  if (min !== null) parts.push(`${field}:[${String(Math.round(min))} TO *]`);
}

/**
 * Build the canonical Freesound `filter=` string.
 * Key order is fixed (alphabetical by emitted key): avg_rating, boominess,
 * brightness, created, duration, geofilt, hardness, license, loopable,
 * single_event, tag, tonality, type, warmth. Parts are only emitted when
 * set, so states that predate a key are byte-identical forever.
 */
export function canonicalFilterString(p: FilterParams): string {
  const parts: string[] = [];

  if (p.ratingMin !== null) parts.push(`avg_rating:[${formatNum(p.ratingMin)} TO *]`);
  minRange("boominess", p.boominessMin, parts);
  minRange("brightness", p.brightnessMin, parts);

  if (p.createdFrom !== null || p.createdTo !== null) {
    const lo = p.createdFrom ? `${p.createdFrom}T00:00:00Z` : "*";
    const hi = p.createdTo ? `${p.createdTo}T23:59:59Z` : "*";
    parts.push(`created:[${lo} TO ${hi}]`);
  }

  if (p.durationMin !== null || p.durationMax !== null) {
    const lo = p.durationMin !== null ? formatNum(p.durationMin) : "*";
    const hi = p.durationMax !== null ? formatNum(p.durationMax) : "*";
    parts.push(`duration:[${lo} TO ${hi}]`);
  }

  if (p.geo) {
    // Coordinates pinned to 4 decimals (~11 m) — enough for "near here",
    // stable across machines.
    parts.push(
      `{!geofilt sfield=geotag pt=${p.geo.lat.toFixed(4)},${p.geo.lon.toFixed(4)} d=${formatNum(p.geo.radiusKm)}}`,
    );
  }

  minRange("hardness", p.hardnessMin, parts);

  if (p.license) {
    parts.push(`license:${quoteValue(p.license)}`);
  }

  if (p.loopable) parts.push("loopable:true");
  if (p.singleEvent) parts.push("single_event:true");

  for (const tag of [...new Set(p.tags.map(normalizeText))].filter(Boolean).sort()) {
    parts.push(`tag:${quoteValue(tag)}`);
  }

  // Tonality keeps its exact case — Solr string matching is
  // case-sensitive and the value comes from a fixed select, so it is
  // canonical by construction.
  if (p.tonality) parts.push(`tonality:${quoteValue(p.tonality)}`);

  const types = [...new Set(p.types.map(normalizeText))].filter(Boolean).sort();
  if (types.length === 1) {
    parts.push(`type:${types[0]}`);
  } else if (types.length > 1) {
    parts.push(`type:(${types.join(" OR ")})`);
  }

  minRange("warmth", p.warmthMin, parts);

  return parts.join(" ");
}

/**
 * Build the seed string for the week. Everything that influences the set
 * goes in here, `|`-separated: week, salt, sample count, query, filter.
 */
export function seedString(
  week: string,
  salt: string,
  sampleCount: number,
  p: FilterParams,
): string {
  return [
    week,
    normalizeText(salt),
    String(sampleCount),
    normalizeText(p.query),
    canonicalFilterString(p),
  ].join("|");
}
