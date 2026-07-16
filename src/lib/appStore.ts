/**
 * The app store: URL-backed application state behind a small interface.
 *
 * The URL is the single source of truth; the store owns parse-on-create,
 * write-back on every change, re-parse on browser navigation, and the
 * lock-clearing invariant: editing anything while an ID lock is active
 * clears the lock — controls and set must never silently diverge. The
 * invariant's *decision* lives here; its side effects (stop playback,
 * reset results) are wired by the composition root via `onLockCleared`.
 *
 * The URL adapter is the seam: browser history in the app
 * (`browserUrlAdapter`), a recording fake in tests.
 */

import { computed, signal, type ReadonlySignal } from "@preact/signals";
import {
  canonicalFilterString,
  normalizeText,
  seedString,
  type FilterParams,
} from "./filters";
import { parseState, serializeState, type AppState } from "./urlState";

export interface UrlAdapter {
  /** Current query string (leading "?" optional). */
  read(): string;
  /** Persist a serialized query string without adding a history entry. */
  write(queryString: string): void;
  /** Subscribe to browser-driven URL changes (back/forward). */
  onExternalChange(handler: () => void): void;
}

export interface AppStore {
  state: ReadonlySignal<AppState>;
  /** The cross-machine seed for the current state (golden format). */
  seed: ReadonlySignal<string>;
  canonicalFilter: ReadonlySignal<string>;
  /** Normalized free-text query, as sent to the API. */
  query: ReadonlySignal<string>;
  update(patch: Partial<AppState>): void;
  updateFilters(patch: Partial<FilterParams>): void;
  /** Explicitly clear an ID lock (fires onLockCleared). */
  unlock(): void;
  /** Runs whenever a lock is cleared — by editing or by unlock(). */
  onLockCleared(callback: () => void): void;
}

export function createAppStore(url: UrlAdapter): AppStore {
  const state = signal(parseState(url.read()));
  const lockClearedListeners: Array<() => void> = [];

  url.onExternalChange(() => {
    state.value = parseState(url.read());
  });

  const fireLockCleared = () => {
    for (const cb of lockClearedListeners) cb();
  };

  function update(patch: Partial<AppState>): void {
    const next = { ...state.value, ...patch };
    const clearsLock = state.value.ids.length > 0 && !("ids" in patch);
    if (clearsLock) next.ids = [];
    state.value = next;
    url.write(serializeState(next));
    if (clearsLock) fireLockCleared();
  }

  return {
    state,
    seed: computed(() =>
      seedString(
        state.value.week,
        state.value.salt,
        state.value.sampleCount,
        state.value.filters,
      ),
    ),
    canonicalFilter: computed(() => canonicalFilterString(state.value.filters)),
    query: computed(() => normalizeText(state.value.filters.query)),
    update,
    updateFilters(patch) {
      update({ filters: { ...state.value.filters, ...patch } });
    },
    unlock() {
      update({ ids: [] });
      fireLockCleared();
    },
    onLockCleared(callback) {
      lockClearedListeners.push(callback);
    },
  };
}

/** The real adapter: browser location/history. */
export function browserUrlAdapter(): UrlAdapter {
  return {
    read: () => location.search,
    write: (qs) => history.replaceState(null, "", qs ? `?${qs}` : location.pathname),
    onExternalChange: (handler) => window.addEventListener("popstate", handler),
  };
}
