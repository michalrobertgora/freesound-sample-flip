import { signal, effect } from "@preact/signals";
import { parseState } from "./lib/urlState";
import { canonicalFilterString, normalizeText, seedString } from "./lib/filters";
import {
  APPLY_URL,
  makeCachedCountFetcher,
  type FreesoundError,
} from "./lib/freesound";
import { resolveSeededSet, type FreesoundSound } from "./lib/resolveSet";
import { formatDuration, formatSampleRate, licenseLabel } from "./lib/display";

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

type SetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; sounds: FreesoundSound[] }
  | { status: "error"; error: FreesoundError };

const setState = signal<SetState>({ status: "idle" });
let generation = 0;

async function generateSet(): Promise<void> {
  const token = apiKey.value;
  if (!token) return;
  const id = ++generation;
  stopPlayback();
  setState.value = { status: "loading" };
  const result = await resolveSeededSet((url) => fetch(url), token, appState.value);
  if (id !== generation) return; // a newer generate superseded this one
  setState.value = result.ok
    ? { status: "ok", sounds: result.sounds }
    : { status: "error", error: result.error };
}

/** One shared audio element: starting a sample stops the previous one. */
const playingId = signal<number | null>(null);
const audio = new Audio();
audio.addEventListener("ended", () => {
  playingId.value = null;
});

function stopPlayback(): void {
  audio.pause();
  playingId.value = null;
}

function togglePlay(sound: FreesoundSound): void {
  if (playingId.value === sound.id) {
    stopPlayback();
    return;
  }
  const src = sound.previews["preview-hq-mp3"] ?? Object.values(sound.previews)[0];
  if (!src) return;
  audio.src = src;
  playingId.value = sound.id;
  audio.play().catch(() => {
    if (playingId.value === sound.id) playingId.value = null;
  });
}

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
    case "zero-results":
      return (
        <p class="status error">
          No sounds match these filters. Try loosening them — a wider duration
          range, fewer tags, or a broader query.
        </p>
      );
    case "partial-fetch":
      return (
        <p class="status error">
          Freesound returned an incomplete set ({error.message}) — nothing was
          rendered, because a partial set would differ from your friend's. Try
          again, or tweak a filter.
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
      <p>
        <button
          class="generate"
          disabled={apiKey.value === "" || setState.value.status === "loading"}
          onClick={generateSet}
        >
          Generate set
        </button>
      </p>
    </section>
  );
}

function SoundCard({ sound }: { sound: FreesoundSound }) {
  const playing = playingId.value === sound.id;
  const preview =
    sound.previews["preview-hq-mp3"] ?? Object.values(sound.previews)[0];
  return (
    <article class={playing ? "card playing" : "card"}>
      {sound.images?.["waveform_m"] && (
        <img class="waveform" src={sound.images["waveform_m"]} alt="" loading="lazy" />
      )}
      <div class="card-body">
        <h3 class="card-title">
          <a href={sound.url} target="_blank" rel="noreferrer">
            {sound.name}
          </a>
        </h3>
        <p class="muted small">by {sound.username}</p>
        <p class="meta small">
          <span>{formatDuration(sound.duration)}</span>
          <span>
            {sound.type.toUpperCase()}
            {sound.samplerate ? ` · ${formatSampleRate(sound.samplerate)}` : ""}
          </span>
          <span class="badge" title={sound.license}>
            {licenseLabel(sound.license)}
          </span>
        </p>
        {sound.tags.length > 0 && (
          <p class="tags small">
            {sound.tags.slice(0, 5).map((t) => (
              <span class="tag" key={t}>
                {t}
              </span>
            ))}
          </p>
        )}
        <p class="actions">
          <button onClick={() => togglePlay(sound)} disabled={!preview}>
            {playing ? "⏸ Stop" : "▶ Play"}
          </button>
          {preview && (
            <a class="small" href={preview} target="_blank" rel="noreferrer">
              Download preview (lossy mp3)
            </a>
          )}
        </p>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <article class="card skeleton" aria-hidden="true">
      <div class="waveform shimmer" />
      <div class="card-body">
        <div class="line shimmer" style={{ width: "70%" }} />
        <div class="line shimmer" style={{ width: "40%" }} />
        <div class="line shimmer" style={{ width: "85%" }} />
        <div class="line shimmer" style={{ width: "55%" }} />
      </div>
    </article>
  );
}

function ResultsPane() {
  const s = setState.value;
  return (
    <main class="results">
      <h2>This week's set</h2>
      {s.status === "idle" && (
        <p class="muted">Enter your key, tune the filters, hit Generate.</p>
      )}
      {s.status === "loading" && (
        <div class="sound-grid">
          {Array.from({ length: appState.value.sampleCount }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      {s.status === "error" && (
        <>
          {errorMessage(s.error)}
          <button onClick={generateSet}>Try again</button>
        </>
      )}
      {s.status === "ok" && (
        <div class="sound-grid">
          {s.sounds.map((sound) => (
            <SoundCard key={sound.id} sound={sound} />
          ))}
        </div>
      )}
    </main>
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
      <ResultsPane />
    </div>
  );
}
