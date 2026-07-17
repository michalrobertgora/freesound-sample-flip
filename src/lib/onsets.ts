/**
 * Lazy per-sound onset times from the Freesound analysis resource.
 * Fetched on first scrub intent (hover or touch-down), cached for the
 * session, silent on failure — scrubbing degrades to free seeking.
 *
 * Live-verified 2026-07-17: GET /apiv2/sounds/<id>/analysis/ returns a
 * flat object whose `onset_times` is an array of seconds (e.g.
 * [0.058, 1.416]); the documented `descriptors=` filter is ignored by
 * the server, so the whole blob comes down regardless — one request per
 * sound, cached, fired only on interaction.
 */

import { signal } from "@preact/signals";
import { apiKey } from "./apiKey";
import { API_BASE } from "./freesound";

/** null = fetched but unavailable (no analysis / error); absent = not fetched. */
const cache = new Map<number, number[] | null>();
const inFlight = new Set<number>();

/** Bumped when any fetch settles, so subscribed components re-read the cache. */
const version = signal(0);

/** Onsets for `id`: seconds ascending, or null/undefined when unavailable/unfetched. */
export function onsetsFor(id: number): number[] | null | undefined {
  void version.value; // subscribe to settle events
  return cache.get(id);
}

/** Start a fetch for `id` unless one already happened; cheap to call repeatedly. */
export function ensureOnsets(id: number): void {
  const token = apiKey.value;
  if (!token || cache.has(id) || inFlight.has(id)) return;
  inFlight.add(id);
  fetch(`${API_BASE}/sounds/${id}/analysis/?token=${token}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body: unknown) => {
      const raw = (body as { onset_times?: unknown } | null)?.onset_times;
      const times = Array.isArray(raw)
        ? raw.filter((t): t is number => typeof t === "number" && Number.isFinite(t))
        : [];
      cache.set(id, times.length > 0 ? times : null);
    })
    .catch(() => {
      cache.set(id, null);
    })
    .finally(() => {
      inFlight.delete(id);
      version.value++;
    });
}
