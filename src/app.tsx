/**
 * Composition root: creates nothing but wiring. State lives in the app
 * store (lib/appStore via ./store), playback in the player module; this
 * file connects them, owns the async orchestration (live count +
 * set resolution), and renders the layout from components/.
 *
 * The Freesound token lives server-side in the Worker proxy (see proxy/),
 * so there is no key to enter — the app is usable immediately on load.
 */

import { computed, effect, signal } from "@preact/signals";
import { AdvancedSection } from "./components/AdvancedSection";
import { CountSection, type CountState } from "./components/CountSection";
import { FiltersSection } from "./components/FiltersSection";
import { LockBanner } from "./components/LockBanner";
import { ResultsPane, type SetState } from "./components/ResultsPane";
import { WeekSection } from "./components/WeekSection";
import { canonicalFilterString, normalizeText } from "./lib/filters";
import { makeCachedCountFetcher } from "./lib/freesound";
import * as player from "./lib/player";
import { resolveLockedSet, resolveSeededSet, type LockedSlot } from "./lib/resolveSet";
import { isDark, toggleTheme } from "./lib/theme";
import { serializeState } from "./lib/urlState";
import { store } from "./store";

/** Bumped by the "Try again" button to re-run the count effect. */
const retryTick = signal(0);
const countState = signal<CountState>({ status: "loading" });
const setState = signal<SetState>({ status: "idle" });
const copied = signal(false);
let generation = 0;

/** Seeded draw normally; a URL with ids is a locked set and resolves those. */
async function generateSet(): Promise<void> {
  const id = ++generation;
  player.stop();
  setState.value = { status: "loading" };
  const s = store.state.value;
  const result =
    s.ids.length > 0
      ? await resolveLockedSet((url) => fetch(url), s.ids)
      : await resolveSeededSet((url) => fetch(url), s).then((r) =>
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

// A locked link (ids in the URL) resolves immediately on load.
if (store.state.value.ids.length > 0) void generateSet();

const fetchCountCached = makeCachedCountFetcher((url) => fetch(url));
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

effect(() => {
  const s = store.state.value;
  void retryTick.value;

  clearTimeout(debounceTimer);
  const query = normalizeText(s.filters.query);
  const filter = canonicalFilterString(s.filters);
  countState.value = { status: "loading" };
  const id = ++requestId;
  debounceTimer = setTimeout(async () => {
    const result = await fetchCountCached(query, filter);
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

const generateDisabled = computed(() => setState.value.status === "loading");

export function App() {
  return (
    <div class="layout">
      <aside class="controls">
        <div class="title-row">
          <h1>Freesound Flip</h1>
          <span class="title-actions">
            <details class="info-pop">
              <summary aria-label="About this app" title="About">i</summary>
              <div class="pop small">
                <p>
                  Weekly sample challenge — deterministic Freesound picks. Same
                  week, salt, and filters produce the same set on any machine;
                  share a set link to pin the exact sounds.
                </p>
                <p>
                  Downloading a sample's high-quality original needs a free
                  Freesound account.
                </p>
                <p>
                  Preview each sample at 0.5× / 1× / 2× speed, with re-pitch
                  (pitch shifts with speed) or constant pitch — to feel how it
                  will behave when you repitch it on your instruments later.
                </p>
              </div>
            </details>
            <button
              class="small theme-toggle"
              onClick={toggleTheme}
              title="Toggle light/dark theme"
            >
              {isDark.value ? "☀" : "☾"}
            </button>
          </span>
        </div>
        <div class="control-stack">
          <LockBanner />
          {/* Disabled + greyed while a set is locked; the LockBanner's
              Unlock button sits outside this and stays live. */}
          <fieldset class="lockable" disabled={store.state.value.ids.length > 0}>
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
        </div>
        <details>
          <summary class="muted small">Debug: URL state &amp; seed</summary>
          <pre>{JSON.stringify(store.state.value, null, 2)}</pre>
          <pre>{store.seed.value}</pre>
        </details>
      </aside>
      <ResultsPane
        set={setState}
        copied={copied}
        onGenerate={() => void generateSet()}
        onCopyLink={(slots) => void copySetLink(slots)}
      />
    </div>
  );
}
