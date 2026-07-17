/**
 * Composition root: creates nothing but wiring. State lives in the app
 * store (lib/appStore via ./store), playback in the player module; this
 * file connects them, owns the async orchestration (live count +
 * set resolution — candidate C3 may lift these out later), and renders
 * the layout from components/.
 */

import { computed, effect, signal } from "@preact/signals";
import { AdvancedSection } from "./components/AdvancedSection";
import { ApiKeyControls, KeyOnboarding } from "./components/ApiKeySection";
import { CountSection, type CountState } from "./components/CountSection";
import { FiltersSection } from "./components/FiltersSection";
import { LockBanner } from "./components/LockBanner";
import { ResultsPane, type SetState } from "./components/ResultsPane";
import { WeekSection } from "./components/WeekSection";
import { apiKey } from "./lib/apiKey";
import { canonicalFilterString, normalizeText } from "./lib/filters";
import { makeCachedCountFetcher } from "./lib/freesound";
import * as player from "./lib/player";
import { resolveLockedSet, resolveSeededSet, type LockedSlot } from "./lib/resolveSet";
import { serializeState } from "./lib/urlState";
import { store } from "./store";

/** Bumped by the "Try again" button to re-run the count effect. */
const retryTick = signal(0);
const countState = signal<CountState>({ status: "no-key" });
const setState = signal<SetState>({ status: "idle" });
const copied = signal(false);
let generation = 0;

/** Seeded draw normally; a URL with ids is a locked set and resolves those. */
async function generateSet(): Promise<void> {
  const token = apiKey.value;
  if (!token) return;
  const id = ++generation;
  player.stop();
  setState.value = { status: "loading" };
  const s = store.state.value;
  const result =
    s.ids.length > 0
      ? await resolveLockedSet((url) => fetch(url), token, s.ids)
      : await resolveSeededSet((url) => fetch(url), token, s).then((r) =>
          r.ok ? { ok: true as const, slots: r.sounds as LockedSlot[] } : r,
        );
  if (id !== generation) return; // a newer generate superseded this one
  setState.value = result.ok
    ? { status: "ok", slots: result.slots }
    : { status: "error", error: result.error };
}

// The lock-clearing invariant's side effects, wired once: the store
// decides *when*, this decides *what*.
store.onLockCleared(() => {
  player.stop();
  setState.value = { status: "idle" };
});

// A locked link (ids in the URL) resolves immediately on load…
if (store.state.value.ids.length > 0 && apiKey.value) void generateSet();

// …or as soon as a key arrives.
let hadKey = apiKey.value !== "";
effect(() => {
  const hasKey = apiKey.value !== "";
  if (!hadKey && hasKey && store.state.value.ids.length > 0) void generateSet();
  hadKey = hasKey;
});

const fetchCountCached = makeCachedCountFetcher((url) => fetch(url));
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

effect(() => {
  const token = apiKey.value;
  const s = store.state.value;
  void retryTick.value;

  clearTimeout(debounceTimer);
  if (!token) {
    countState.value = { status: "no-key" };
    return;
  }

  const query = normalizeText(s.filters.query);
  const filter = canonicalFilterString(s.filters);
  countState.value = { status: "loading" };
  const id = ++requestId;
  debounceTimer = setTimeout(async () => {
    const result = await fetchCountCached(token, query, filter);
    if (id !== requestId) return; // a newer request superseded this one
    countState.value = result.ok
      ? { status: "ok", count: result.count }
      : { status: "error", error: result.error };
  }, 300);
});

async function copySetLink(slots: LockedSlot[]): Promise<void> {
  const qs = serializeState({ ...store.state.value, ids: slots.map((s) => s.id) });
  const url = `${location.origin}${location.pathname}?${qs}`;
  await navigator.clipboard.writeText(url);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

const generateDisabled = computed(
  () => apiKey.value === "" || setState.value.status === "loading",
);

export function App() {
  return (
    <div class="layout">
      <aside class="controls">
        <h1>Cotygodniowy Flip</h1>
        <p class="muted">Weekly sample challenge — deterministic Freesound picks.</p>
        <ApiKeyControls />
        {/* fieldset[disabled] inert-ifies every control while no key exists */}
        <fieldset class="gated" disabled={apiKey.value === ""}>
          <LockBanner />
          <WeekSection />
          <FiltersSection />
          <AdvancedSection />
          <CountSection
            count={countState}
            generateDisabled={generateDisabled}
            onRetry={() => retryTick.value++}
            onGenerate={() => void generateSet()}
          />
        </fieldset>
        <details>
          <summary class="muted small">Debug: URL state &amp; seed</summary>
          <pre>{JSON.stringify(store.state.value, null, 2)}</pre>
          <pre>{store.seed.value}</pre>
        </details>
      </aside>
      {apiKey.value === "" ? (
        <KeyOnboarding />
      ) : (
        <ResultsPane
          set={setState}
          copied={copied}
          onGenerate={() => void generateSet()}
          onCopyLink={(slots) => void copySetLink(slots)}
        />
      )}
    </div>
  );
}
