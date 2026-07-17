/**
 * Set resolution: the seam between app state and the network.
 * Given app state and a transport, produce the week's resolved sample set
 * (or a typed error). This is where the deterministic draw meets Freesound:
 *
 *   count -> quantize (absorbs mid-week drift) -> cap -> seeded draw of
 *   N distinct indices -> group indices by page -> fetch pages sorted
 *   created_asc (append-only, so positions are stable) -> pick sounds,
 *   return them in draw order.
 *
 * Any fetch problem is an error for the whole set — never a silent
 * partial set, because both users must see identical results or none.
 */

import { canonicalFilterString, normalizeText, seedString } from "./filters";
import {
  API_BASE,
  fetchCount,
  requestJson,
  type FreesoundError,
  type Transport,
} from "./freesound";
import { drawDistinctIndices, quantizeCount, seededRng } from "./prng";
import type { AppState } from "./urlState";

/**
 * Draws never go past this index regardless of how many sounds match.
 * Verified live 2026-07-16: deep pagination is healthy far beyond this
 * (pages up to index ~200 000 answered in 250-450 ms; 404 only past the
 * end of the result set), so this cap is a deliberate design margin, not
 * an API limit. Part of the cross-machine contract: both users must use
 * the same cap or their draws diverge.
 */
export const INDEX_CAP = 10_000;

/** Freesound's documented maximum page size — fewest requests per set. */
export const PAGE_SIZE = 150;

/** Everything ticket 03's cards need, fetched up front. */
export const SOUND_FIELDS =
  "id,name,username,duration,type,samplerate,filesize,license,tags,url,previews,images";

export interface FreesoundSound {
  id: number;
  name: string;
  username: string;
  duration: number;
  type: string;
  samplerate: number;
  /** Size of the original upload in bytes. */
  filesize?: number;
  license: string;
  tags: string[];
  /** Freesound page for the sound. */
  url: string;
  /** Preview URLs keyed by variant, e.g. "preview-hq-mp3". */
  previews: Record<string, string>;
  /** Waveform/spectrogram image URLs keyed by variant. */
  images: Record<string, string>;
}

export type ResolveResult =
  | { ok: true; sounds: FreesoundSound[] }
  | { ok: false; error: FreesoundError };

/** A locked-set slot whose sound has been removed from Freesound. */
export interface MissingSound {
  id: number;
  missing: true;
}

export type LockedSlot = FreesoundSound | MissingSound;

export type LockedResult =
  | { ok: true; slots: LockedSlot[] }
  | { ok: false; error: FreesoundError };

function buildPageUrl(
  token: string,
  query: string,
  filter: string,
  page: number,
): string {
  const q = new URLSearchParams();
  q.set("page_size", String(PAGE_SIZE));
  q.set("fields", SOUND_FIELDS);
  q.set("sort", "created_asc");
  q.set("page", String(page));
  if (query) q.set("query", query);
  if (filter) q.set("filter", filter);
  q.set("token", token);
  return `${API_BASE}/search/?${q.toString()}`;
}

async function fetchPage(
  transport: Transport,
  url: string,
): Promise<{ ok: true; results: unknown[] } | { ok: false; error: FreesoundError }> {
  const r = await requestJson(transport, url);
  if (!r.ok) return r;
  const results = (r.body as { results?: unknown })?.results;
  if (!Array.isArray(results)) {
    return {
      ok: false,
      error: { kind: "unexpected", message: "response has no results" },
    };
  }
  return { ok: true, results };
}

/**
 * Resolve an ID-locked set: one search request filtered by ID — no count,
 * no seed, no draw. The API returns its own order, so slots are reordered
 * client-side to the requested (draw) order; a removed sound becomes an
 * explicit placeholder slot rather than silently shrinking the set.
 */
export async function resolveLockedSet(
  transport: Transport,
  token: string,
  ids: number[],
): Promise<LockedResult> {
  const q = new URLSearchParams();
  q.set("page_size", String(PAGE_SIZE));
  q.set("fields", SOUND_FIELDS);
  q.set("filter", `id:(${ids.join(" OR ")})`);
  q.set("token", token);

  const fetched = await fetchPage(transport, `${API_BASE}/search/?${q.toString()}`);
  if (!fetched.ok) return fetched;

  const byId = new Map<number, FreesoundSound>();
  for (const raw of fetched.results) {
    const sound = raw as FreesoundSound;
    byId.set(sound.id, sound);
  }
  return {
    ok: true,
    slots: ids.map((id) => byId.get(id) ?? { id, missing: true as const }),
  };
}

/** Resolve the week's set deterministically from (week, salt, count, filters). */
export async function resolveSeededSet(
  transport: Transport,
  token: string,
  state: AppState,
): Promise<ResolveResult> {
  const query = normalizeText(state.filters.query);
  const filter = canonicalFilterString(state.filters);

  const counted = await fetchCount(transport, token, query, filter);
  if (!counted.ok) return counted;
  if (counted.count === 0) return { ok: false, error: { kind: "zero-results" } };

  const seed = seedString(state.week, state.salt, state.sampleCount, state.filters);
  const range = Math.min(quantizeCount(counted.count), INDEX_CAP);
  const indices = drawDistinctIndices(seededRng(seed), state.sampleCount, range);

  // One request per distinct page, in ascending page order for politeness.
  const pages = [...new Set(indices.map((i) => Math.floor(i / PAGE_SIZE) + 1))].sort(
    (a, b) => a - b,
  );
  const soundByIndex = new Map<number, FreesoundSound>();

  for (const page of pages) {
    const fetched = await fetchPage(transport, buildPageUrl(token, query, filter, page));
    if (!fetched.ok) return fetched;
    const start = (page - 1) * PAGE_SIZE;
    fetched.results.forEach((sound, offset) => {
      soundByIndex.set(start + offset, sound as FreesoundSound);
    });
  }

  const sounds: FreesoundSound[] = [];
  for (const i of indices) {
    const sound = soundByIndex.get(i);
    if (!sound) {
      return {
        ok: false,
        error: {
          kind: "partial-fetch",
          message: `drawn sound #${i + 1} of ${range} is missing from its page`,
        },
      };
    }
    sounds.push(sound);
  }

  return { ok: true, sounds };
}
