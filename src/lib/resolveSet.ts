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
  type FreesoundError,
  type Transport,
  type TransportResponse,
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
  "id,name,username,duration,type,license,tags,url,previews,images";

export interface FreesoundSound {
  id: number;
  name: string;
  username: string;
  duration: number;
  type: string;
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
  let res: TransportResponse;
  try {
    res = await transport(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "unexpected", message } };
  }

  if (res.status === 401) return { ok: false, error: { kind: "invalid-key" } };
  if (res.status === 429) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* body unreadable; empty detail */
    }
    return { ok: false, error: { kind: "rate-limited", detail } };
  }
  if (res.status !== 200) {
    return { ok: false, error: { kind: "unexpected", message: `HTTP ${res.status}` } };
  }

  try {
    const body = (await res.json()) as { results?: unknown };
    if (!Array.isArray(body?.results)) {
      return {
        ok: false,
        error: { kind: "unexpected", message: "response has no results" },
      };
    }
    return { ok: true, results: body.results };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "unexpected", message } };
  }
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
