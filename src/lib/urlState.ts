/**
 * URL query params are the single source of truth for app state.
 * Parse on load, write back via history.replaceState.
 *
 * Two modes, decided by `ids`:
 *   - `ids` present → locked set: fetch exactly these sounds, skip the seeded draw.
 *   - `ids` absent  → seeded mode: derive the set from (week, salt, filters).
 *
 * Serialization omits values equal to defaults, so pristine URLs stay short
 * and default-equivalent states produce identical URLs.
 */

import { DEFAULT_FILTERS, type FilterParams, type GeoPoint } from "./filters";
import { currentIsoWeek, isValidIsoWeek } from "./isoWeek";

export interface AppState {
  week: string;
  salt: string;
  sampleCount: number;
  filters: FilterParams;
  /** Locked sound IDs; non-empty means "resolve exactly these". */
  ids: number[];
}

export const MIN_SAMPLES = 3;
export const MAX_SAMPLES = 6;
export const DEFAULT_SAMPLE_COUNT = 4;

/**
 * Locked sets resolve in ONE request, so ids beyond the API's max page
 * size (150) can never be fetched — without this cap they would render
 * falsely as "removed from Freesound". The app itself emits 3–6 ids;
 * only hand-crafted URLs ever hit this.
 */
export const MAX_LOCKED_IDS = 150;

export function defaultState(): AppState {
  return {
    week: currentIsoWeek(),
    salt: "",
    sampleCount: DEFAULT_SAMPLE_COUNT,
    filters: { ...DEFAULT_FILTERS, tags: [], types: [] },
    ids: [],
  };
}

function parseNum(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseList(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function parseDate(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** "lat,lon,radiusKm" → GeoPoint, or null when malformed/out of range. */
function parseGeo(v: string | null): GeoPoint | null {
  if (!v) return null;
  const [lat, lon, radiusKm] = v.split(",").map(Number);
  if (![lat, lon, radiusKm].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || radiusKm <= 0) return null;
  return { lat, lon, radiusKm };
}

export function parseState(search: string): AppState {
  const q = new URLSearchParams(search);
  const d = defaultState();

  const week = q.get("w");
  const n = parseNum(q.get("n"));
  const dmin = parseNum(q.get("dmin"));
  const dmax = parseNum(q.get("dmax"));

  return {
    week: week && isValidIsoWeek(week) ? week : d.week,
    salt: q.get("salt")?.trim() ?? "",
    sampleCount: n !== null ? clamp(Math.round(n), MIN_SAMPLES, MAX_SAMPLES) : d.sampleCount,
    filters: {
      query: q.get("q") ?? "",
      tags: parseList(q.get("tags")),
      durationMin: q.has("dmin") ? dmin : d.filters.durationMin,
      durationMax: q.has("dmax") ? dmax : d.filters.durationMax,
      types: parseList(q.get("type")),
      license: q.get("lic") ?? "",
      tonality: q.get("ton") ?? "",
      loopable: q.get("loop") === "1",
      singleEvent: q.get("single") === "1",
      brightnessMin: parseNum(q.get("bri")),
      warmthMin: parseNum(q.get("warm")),
      hardnessMin: parseNum(q.get("hard")),
      boominessMin: parseNum(q.get("boom")),
      ratingMin: parseNum(q.get("rating")),
      createdFrom: parseDate(q.get("cfrom")),
      createdTo: parseDate(q.get("cto")),
      geo: parseGeo(q.get("geo")),
    },
    ids: parseList(q.get("ids"))
      .map(Number)
      .filter((x) => Number.isInteger(x) && x > 0)
      .slice(0, MAX_LOCKED_IDS),
  };
}

export function serializeState(s: AppState): string {
  const d = defaultState();
  const q = new URLSearchParams();

  // Week is always explicit: a copied link must pin the week, not float with "now".
  q.set("w", s.week);
  // Controls store salt raw while typing; the URL carries it trimmed, so
  // whitespace-only salt and empty salt serialize identically.
  const salt = s.salt.trim();
  if (salt) q.set("salt", salt);
  if (s.sampleCount !== d.sampleCount) q.set("n", String(s.sampleCount));
  if (s.filters.query) q.set("q", s.filters.query);
  if (s.filters.tags.length) q.set("tags", s.filters.tags.join(","));
  if (s.filters.durationMin !== d.filters.durationMin)
    q.set("dmin", s.filters.durationMin === null ? "" : String(s.filters.durationMin));
  if (s.filters.durationMax !== d.filters.durationMax)
    q.set("dmax", s.filters.durationMax === null ? "" : String(s.filters.durationMax));
  if (s.filters.types.length) q.set("type", s.filters.types.join(","));
  if (s.filters.license) q.set("lic", s.filters.license);
  const f = s.filters;
  if (f.tonality) q.set("ton", f.tonality);
  if (f.loopable) q.set("loop", "1");
  if (f.singleEvent) q.set("single", "1");
  if (f.brightnessMin !== null) q.set("bri", String(f.brightnessMin));
  if (f.warmthMin !== null) q.set("warm", String(f.warmthMin));
  if (f.hardnessMin !== null) q.set("hard", String(f.hardnessMin));
  if (f.boominessMin !== null) q.set("boom", String(f.boominessMin));
  if (f.ratingMin !== null) q.set("rating", String(f.ratingMin));
  if (f.createdFrom) q.set("cfrom", f.createdFrom);
  if (f.createdTo) q.set("cto", f.createdTo);
  if (f.geo) q.set("geo", `${f.geo.lat},${f.geo.lon},${f.geo.radiusKm}`);
  if (s.ids.length) q.set("ids", s.ids.join(","));

  return q.toString();
}

/** Write state into the address bar without adding a history entry. */
export function pushStateToUrl(s: AppState): void {
  const qs = serializeState(s);
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}
