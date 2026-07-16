import { signal, effect } from "@preact/signals";
import {
  MAX_SAMPLES,
  MIN_SAMPLES,
  parseState,
  pushStateToUrl,
  serializeState,
  type AppState,
} from "./lib/urlState";
import {
  canonicalFilterString,
  formatNum,
  normalizeText,
  seedString,
  type FilterParams,
} from "./lib/filters";
import { currentIsoWeek, shiftIsoWeek } from "./lib/isoWeek";
import {
  APPLY_URL,
  makeCachedCountFetcher,
  type FreesoundError,
} from "./lib/freesound";
import {
  resolveLockedSet,
  resolveSeededSet,
  type FreesoundSound,
  type LockedSlot,
} from "./lib/resolveSet";
import {
  formatDuration,
  formatSampleRate,
  licenseLabel,
  previewUrl,
} from "./lib/display";

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
  const hadKey = apiKey.value !== "";
  apiKey.value = v;
  if (v) localStorage.setItem(KEY_STORAGE, v);
  else localStorage.removeItem(KEY_STORAGE);
  // A locked link opened without a key resolves as soon as one arrives.
  if (!hadKey && v && appState.value.ids.length > 0) void generateSet();
}

function updateState(patch: Partial<AppState>): void {
  const next = { ...appState.value, ...patch };
  // Editing any control while an ID lock is active clears the lock (the
  // banner says so) — controls and set must never silently diverge.
  if (appState.value.ids.length > 0 && !("ids" in patch)) {
    next.ids = [];
    stopPlayback();
    setState.value = { status: "idle" };
  }
  appState.value = next;
  pushStateToUrl(next);
}

function updateFilters(patch: Partial<FilterParams>): void {
  updateState({ filters: { ...appState.value.filters, ...patch } });
}

function unlockSet(): void {
  stopPlayback();
  setState.value = { status: "idle" };
  updateState({ ids: [] });
}

const fetchCountCached = makeCachedCountFetcher((url) => fetch(url));

type SetState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; slots: LockedSlot[] }
  | { status: "error"; error: FreesoundError };

const setState = signal<SetState>({ status: "idle" });
let generation = 0;

/** Seeded draw normally; a URL with ids is a locked set and resolves those. */
async function generateSet(): Promise<void> {
  const token = apiKey.value;
  if (!token) return;
  const id = ++generation;
  stopPlayback();
  setState.value = { status: "loading" };
  const s = appState.value;
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

/** One shared audio element: starting a sample stops the previous one. */
const playingId = signal<number | null>(null);
const audio = new Audio();
// `pause` also fires on ended and on OS-level pauses (media keys); the
// paused check keeps a queued event from clearing a just-started track.
const syncPlayingFromAudio = () => {
  if (audio.paused) playingId.value = null;
};
audio.addEventListener("ended", syncPlayingFromAudio);
audio.addEventListener("pause", syncPlayingFromAudio);
audio.addEventListener("error", () => {
  playingId.value = null;
});

function stopPlayback(): void {
  audio.pause();
  playingId.value = null;
}

// A locked link (ids in the URL) resolves immediately on load.
if (appState.value.ids.length > 0 && apiKey.value) void generateSet();

const copied = signal(false);

async function copySetLink(slots: LockedSlot[]): Promise<void> {
  const qs = serializeState({ ...appState.value, ids: slots.map((s) => s.id) });
  const url = `${location.origin}${location.pathname}?${qs}`;
  await navigator.clipboard.writeText(url);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function togglePlay(sound: FreesoundSound): void {
  if (playingId.value === sound.id) {
    stopPlayback();
    return;
  }
  const src = previewUrl(sound.previews);
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

/** Log-scale duration slider: position 0..steps ↔ seconds, quantized to
 * 0.1 — the same precision the canonical filter string uses, so slider
 * values can never introduce float-noise seed drift. */
const DUR_SLIDER = { min: 0.1, max: 600, steps: 600 };

function posToDur(pos: number): number {
  const v =
    DUR_SLIDER.min *
    Math.exp((pos / DUR_SLIDER.steps) * Math.log(DUR_SLIDER.max / DUR_SLIDER.min));
  return Math.round(v * 10) / 10;
}

function durToPos(d: number): number {
  return Math.round(
    (Math.log(d / DUR_SLIDER.min) / Math.log(DUR_SLIDER.max / DUR_SLIDER.min)) *
      DUR_SLIDER.steps,
  );
}

const FILE_TYPES = ["wav", "aiff", "flac", "mp3", "ogg", "m4a"];

/** Live-verified 2026-07-16: exactly these strings match sounds in the
 * API's license filter ("Attribution Noncommercial" matches nothing). */
const LICENSES: Array<[value: string, label: string]> = [
  ["", "Any"],
  ["Creative Commons 0", "CC0"],
  ["Attribution", "CC-BY"],
  ["Attribution NonCommercial", "CC-BY-NC"],
];

function LockBanner() {
  const ids = appState.value.ids;
  if (ids.length === 0) return null;
  return (
    <section class="lock-banner">
      <p class="status">
        🔒 <strong>Locked set</strong> — this link pins {ids.length} exact
        sounds; the seeded draw is bypassed. Changing any control (or
        unlocking) clears the lock.
      </p>
      <button onClick={unlockSet}>Unlock &amp; edit</button>
    </section>
  );
}

function WeekSection() {
  const s = appState.value;
  return (
    <section>
      <h2>Week</h2>
      <div class="week-row">
        <button
          aria-label="Previous week"
          onClick={() => updateState({ week: shiftIsoWeek(s.week, -1) })}
        >
          ◀
        </button>
        <strong class="week-label">{s.week}</strong>
        <button
          aria-label="Next week"
          onClick={() => updateState({ week: shiftIsoWeek(s.week, 1) })}
        >
          ▶
        </button>
        {s.week !== currentIsoWeek() && (
          <button onClick={() => updateState({ week: currentIsoWeek() })}>
            this week
          </button>
        )}
      </div>
      <label class="field">
        <span>
          Salt <span class="muted small">(agreed reroll, e.g. take2)</span>
        </span>
        <input
          value={s.salt}
          onInput={(e) => updateState({ salt: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="field">
        <span>Samples</span>
        <select
          value={String(s.sampleCount)}
          onChange={(e) =>
            updateState({ sampleCount: Number((e.target as HTMLSelectElement).value) })
          }
        >
          {Array.from(
            { length: MAX_SAMPLES - MIN_SAMPLES + 1 },
            (_, i) => MIN_SAMPLES + i,
          ).map((n) => (
            <option value={String(n)} key={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function toggleType(t: string): void {
  const cur = new Set(appState.value.filters.types);
  if (cur.has(t)) cur.delete(t);
  else cur.add(t);
  updateFilters({ types: [...cur] });
}

function FiltersSection() {
  const f = appState.value.filters;
  const dmin = f.durationMin ?? DUR_SLIDER.min;
  const dmax = f.durationMax ?? DUR_SLIDER.max;
  return (
    <section>
      <h2>Filters</h2>
      <label class="field">
        <span>Search</span>
        <input
          value={f.query}
          placeholder="e.g. rain, drone, glass"
          onInput={(e) => updateFilters({ query: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="field">
        <span>
          Tags <span class="muted small">(comma-separated)</span>
        </span>
        <input
          key={f.tags.join(",")}
          defaultValue={f.tags.join(", ")}
          placeholder="e.g. field-recording, metal"
          onChange={(e) =>
            updateFilters({
              tags: (e.target as HTMLInputElement).value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div class="field">
        <span>
          Duration: {formatNum(dmin)}–{formatNum(dmax)} s
        </span>
        <input
          type="range"
          aria-label="Minimum duration"
          min="0"
          max={DUR_SLIDER.steps}
          value={durToPos(dmin)}
          onInput={(e) => {
            const v = posToDur(Number((e.target as HTMLInputElement).value));
            updateFilters({ durationMin: Math.min(v, dmax) });
          }}
        />
        <input
          type="range"
          aria-label="Maximum duration"
          min="0"
          max={DUR_SLIDER.steps}
          value={durToPos(dmax)}
          onInput={(e) => {
            const v = posToDur(Number((e.target as HTMLInputElement).value));
            updateFilters({ durationMax: Math.max(v, dmin) });
          }}
        />
      </div>
      <fieldset class="field types">
        <legend>File types</legend>
        {FILE_TYPES.map((t) => (
          <label class="inline" key={t}>
            <input
              type="checkbox"
              checked={f.types.includes(t)}
              onChange={() => toggleType(t)}
            />{" "}
            {t}
          </label>
        ))}
      </fieldset>
      <label class="field">
        <span>License</span>
        <select
          value={f.license}
          onChange={(e) =>
            updateFilters({ license: (e.target as HTMLSelectElement).value })
          }
        >
          {LICENSES.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

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
  const preview = previewUrl(sound.previews);
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

function MissingCard({ id }: { id: number }) {
  return (
    <article class="card missing">
      <div class="card-body">
        <h3 class="card-title">Removed from Freesound</h3>
        <p class="muted small">
          Sound #{id} was deleted after this link was made. The rest of the
          set still stands.
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
        <>
          <p class="actions">
            <button onClick={() => void copySetLink(s.slots)}>
              {copied.value ? "Copied!" : "Copy set link"}
            </button>
            <span class="muted small">
              pins these exact sounds — your friend opens it, no reroll
            </span>
          </p>
          <div class="sound-grid">
            {s.slots.map((slot) =>
              "missing" in slot ? (
                <MissingCard key={slot.id} id={slot.id} />
              ) : (
                <SoundCard key={slot.id} sound={slot} />
              ),
            )}
          </div>
        </>
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
        <LockBanner />
        <WeekSection />
        <FiltersSection />
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
