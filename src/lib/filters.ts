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
}

export const DEFAULT_FILTERS: FilterParams = {
  query: "",
  tags: [],
  durationMin: 0.5,
  durationMax: 30,
  types: [],
  license: "",
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

/**
 * Build the canonical Freesound `filter=` string.
 * Key order is fixed (alphabetical): duration, license, tag, type.
 */
export function canonicalFilterString(p: FilterParams): string {
  const parts: string[] = [];

  if (p.durationMin !== null || p.durationMax !== null) {
    const lo = p.durationMin !== null ? formatNum(p.durationMin) : "*";
    const hi = p.durationMax !== null ? formatNum(p.durationMax) : "*";
    parts.push(`duration:[${lo} TO ${hi}]`);
  }

  if (p.license) {
    parts.push(`license:${quoteValue(p.license)}`);
  }

  for (const tag of [...new Set(p.tags.map(normalizeText))].filter(Boolean).sort()) {
    parts.push(`tag:${quoteValue(tag)}`);
  }

  const types = [...new Set(p.types.map(normalizeText))].filter(Boolean).sort();
  if (types.length === 1) {
    parts.push(`type:${types[0]}`);
  } else if (types.length > 1) {
    parts.push(`type:(${types.join(" OR ")})`);
  }

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
