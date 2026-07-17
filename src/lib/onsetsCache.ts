/**
 * Lazy per-sound onset times from the Freesound analysis resource —
 * factory only, wired to the real fetch + API key in ./onsets (kept
 * separate so tests can import this without touching browser globals).
 *
 * Live-verified 2026-07-17: GET /apiv2/sounds/<id>/analysis/ returns a
 * flat object whose `onset_times` is an array of seconds (e.g.
 * [0.058, 1.416]); the documented `descriptors=` filter is ignored by
 * the server, so the whole blob comes down regardless — one request per
 * sound, cached, fired only on interaction.
 *
 * Caching rules: a 404 (no analysis for this sound) is permanent and
 * caches null; other failures (bad key, network) stay uncached so a
 * later interaction can retry. Built on the Transport seam like every
 * other network module.
 */

import { signal } from "@preact/signals";
import { API_BASE, type Transport } from "./freesound";

export interface OnsetsCache {
  /** Onsets for `id`: seconds ascending; null = permanently unavailable;
   * undefined = not (successfully) fetched yet. */
  onsetsFor(id: number): number[] | null | undefined;
  /** Start a fetch for `id` unless one is cached/in flight; cheap to spam. */
  ensureOnsets(id: number): void;
}

export function createOnsetsCache(transport: Transport): OnsetsCache {
  const cache = new Map<number, number[] | null>();
  const inFlight = new Set<number>();
  // Bumped when any fetch settles, so subscribed components re-read.
  const version = signal(0);

  return {
    onsetsFor(id) {
      void version.value; // subscribe to settle events
      return cache.get(id);
    },
    ensureOnsets(id) {
      if (cache.has(id) || inFlight.has(id)) return;
      inFlight.add(id);
      void (async () => {
        try {
          const res = await transport(`${API_BASE}/sounds/${id}/analysis/`);
          if (res.status === 404) {
            cache.set(id, null); // no analysis for this sound — permanent
          } else if (res.status === 200) {
            const body = (await res.json()) as { onset_times?: unknown };
            const raw = body?.onset_times;
            const times = Array.isArray(raw)
              ? raw.filter(
                  (t): t is number => typeof t === "number" && Number.isFinite(t),
                )
              : [];
            cache.set(id, times.length > 0 ? times : null);
          }
          // other statuses (401, 5xx…): transient — leave uncached, retry later
        } catch {
          // network error: transient — leave uncached
        } finally {
          inFlight.delete(id);
          version.value++;
        }
      })();
    },
  };
}
