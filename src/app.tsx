import { signal, effect } from "@preact/signals";
import { parseState } from "./lib/urlState";
import { canonicalFilterString, normalizeText, seedString } from "./lib/filters";
import {
  APPLY_URL,
  makeCachedCountFetcher,
  type FreesoundError,
} from "./lib/freesound";

const KEY_STORAGE = "freesound-api-key";

const apiKey = signal(localStorage.getItem(KEY_STORAGE) ?? "");
const appState = signal(parseState(location.search));
/** Bumped by the "Try again" button to re-run the count effect. */
const retryTick = signal(0);

type CountState =
  | { status: "no-key" }
  | { status: "loading" }
  | { status: "ok"; count: number }
  | { status: "error"; error: FreesoundError };

const countState = signal<CountState>({ status: "no-key" });

window.addEventListener("popstate", () => {
  appState.value = parseState(location.search);
});

function saveApiKey(value: string): void {
  const v = value.trim();
  apiKey.value = v;
  if (v) localStorage.setItem(KEY_STORAGE, v);
  else localStorage.removeItem(KEY_STORAGE);
}

const fetchCountCached = makeCachedCountFetcher((url) => fetch(url));

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

effect(() => {
  const token = apiKey.value;
  const s = appState.value;
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

function ApiKeySection() {
  return (
    <section>
      <h2>Freesound API key</h2>
      <input
        type="password"
        class="key-input"
        value={apiKey.value}
        placeholder="Paste your API key"
        autocomplete="off"
        onInput={(e) => saveApiKey((e.target as HTMLInputElement).value)}
      />
      <p class="muted small">
        Stored only in this browser — never in shared links.{" "}
        <a href={APPLY_URL} target="_blank" rel="noreferrer">
          Get a key from Freesound
        </a>
      </p>
    </section>
  );
}

function errorMessage(error: FreesoundError) {
  switch (error.kind) {
    case "invalid-key":
      return (
        <p class="status error">
          Freesound rejected that API key. Check for typos or missing
          characters — or apply for a fresh key via the link above.
        </p>
      );
    case "rate-limited":
      return (
        <p class="status error">
          Freesound is throttling requests right now.
          {error.detail ? ` (${error.detail})` : ""} Wait a moment, then try
          again.
        </p>
      );
    case "unexpected":
      return (
        <p class="status error">
          Couldn't reach Freesound: {error.message}. Check your connection and
          try again.
        </p>
      );
  }
}

function CountSection() {
  const c = countState.value;
  return (
    <section>
      <h2>Matching sounds</h2>
      {c.status === "no-key" && (
        <p class="status muted">Enter your API key to see how many sounds match.</p>
      )}
      {c.status === "loading" && <p class="status muted">Counting…</p>}
      {c.status === "ok" && c.count > 0 && (
        <p class="status">
          <strong>{c.count.toLocaleString()}</strong> sounds match these filters.
        </p>
      )}
      {c.status === "ok" && c.count === 0 && (
        <p class="status error">
          No sounds match these filters. Try loosening them — a wider duration
          range, fewer tags, or a broader query.
        </p>
      )}
      {c.status === "error" && (
        <>
          {errorMessage(c.error)}
          <button onClick={() => retryTick.value++}>Try again</button>
        </>
      )}
    </section>
  );
}

export function App() {
  const state = appState.value;
  const seed = seedString(state.week, state.salt, state.sampleCount, state.filters);

  return (
    <div class="layout">
      <aside class="controls">
        <h1>Cotygodniowy Flip</h1>
        <p class="muted">Weekly sample challenge — deterministic Freesound picks.</p>
        <ApiKeySection />
        <CountSection />
        <details>
          <summary class="muted small">Debug: URL state &amp; seed</summary>
          <pre>{JSON.stringify(state, null, 2)}</pre>
          <pre>{seed}</pre>
        </details>
      </aside>
      <main class="results">
        <h2>This week's set</h2>
        <p class="muted">Results will render here (step 3).</p>
      </main>
    </div>
  );
}
