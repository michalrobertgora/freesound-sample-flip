import { DEFAULT_FILTERS, formatNum } from "../lib/filters";
import { store } from "../store";

/** Log-scale duration slider: position 0..steps ↔ seconds, quantized to
 * 0.1 — the same precision the canonical filter string uses, so slider
 * values can never introduce float-noise seed drift. */
const DUR_SLIDER = { min: 0.1, max: 600, steps: 600 };

function durToPos(d: number): number {
  return Math.round(
    (Math.log(d / DUR_SLIDER.min) / Math.log(DUR_SLIDER.max / DUR_SLIDER.min)) *
      DUR_SLIDER.steps,
  );
}

// The default bounds (0.5 / 30) must be exactly restorable, but 30 is not
// on the 0.1-quantized log grid (its nearest position reads back 29.8).
// Snap those two positions to the defaults so a touched slider can return
// to a pristine URL.
const DEFAULT_MIN_POS = durToPos(DEFAULT_FILTERS.durationMin as number);
const DEFAULT_MAX_POS = durToPos(DEFAULT_FILTERS.durationMax as number);

function posToDur(pos: number): number {
  if (pos === DEFAULT_MIN_POS) return DEFAULT_FILTERS.durationMin as number;
  if (pos === DEFAULT_MAX_POS) return DEFAULT_FILTERS.durationMax as number;
  const v =
    DUR_SLIDER.min *
    Math.exp((pos / DUR_SLIDER.steps) * Math.log(DUR_SLIDER.max / DUR_SLIDER.min));
  return Math.round(v * 10) / 10;
}

const FILE_TYPES = ["wav", "aiff", "flac", "mp3", "ogg", "m4a"];

/** Popular tags as listed on freesound.org/search (ticket 09), in site order. */
const POPULAR_TAGS = [
  "field-recording", "multisample", "drum", "loop", "ambient", "single-note",
  "synthesizer", "noise", "synth", "percussion", "ambience", "electronic",
  "sound", "voice", "industrial", "bass", "nature", "soundscape", "music",
  "water", "metal", "dark", "drums", "samples", "atmosphere", "soundtrack",
  "weird", "effect", "fx", "underground", "sci-fi", "beat", "alien", "sfx",
  "foley", "birds", "hit", "ambiance", "horror", "sample", "game", "piano",
  "glitch", "loopable", "guitar", "drone", "city", "snare", "packs", "vocal",
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TONALITIES = NOTES.flatMap((n) => [`${n} major`, `${n} minor`]);

function toggleType(t: string): void {
  const cur = new Set(store.state.value.filters.types);
  if (cur.has(t)) cur.delete(t);
  else cur.add(t);
  store.updateFilters({ types: [...cur] });
}

function toggleTag(t: string): void {
  const cur = store.state.value.filters.tags;
  store.updateFilters({
    tags: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
  });
}

function addCustomTag(input: HTMLInputElement): void {
  const t = input.value.trim();
  if (t && !store.state.value.filters.tags.includes(t)) toggleTag(t);
  input.value = "";
}

function TagChips() {
  const tags = store.state.value.filters.tags;
  const custom = tags.filter((t) => !POPULAR_TAGS.includes(t));
  return (
    <div class="field">
      <span>Tags</span>
      <div class="chips">
        {POPULAR_TAGS.map((t) => (
          <button
            type="button"
            key={t}
            class={`chip ${tags.includes(t) ? "selected" : ""}`}
            aria-pressed={tags.includes(t)}
            onClick={() => toggleTag(t)}
          >
            {t}
          </button>
        ))}
        {custom.map((t) => (
          <button
            type="button"
            key={t}
            class="chip selected custom"
            title="Remove tag"
            onClick={() => toggleTag(t)}
          >
            {t} ×
          </button>
        ))}
      </div>
      <input
        class="chip-input"
        placeholder="Add your own tag…"
        onKeyDown={(e) => {
          if (e.key === "Enter") addCustomTag(e.target as HTMLInputElement);
        }}
        onBlur={(e) => addCustomTag(e.target as HTMLInputElement)}
      />
    </div>
  );
}

export function FiltersSection() {
  const f = store.state.value.filters;
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
          onInput={(e) =>
            store.updateFilters({ query: (e.target as HTMLInputElement).value })
          }
        />
      </label>
      <TagChips />
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
            store.updateFilters({ durationMin: Math.min(v, dmax) });
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
            store.updateFilters({ durationMax: Math.max(v, dmin) });
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
        <span>Tonality</span>
        <select
          value={f.tonality}
          onChange={(e) =>
            store.updateFilters({ tonality: (e.target as HTMLSelectElement).value })
          }
        >
          <option value="">Any</option>
          {TONALITIES.map((t) => (
            <option value={t} key={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div class="field">
        <label class="inline">
          <input
            type="checkbox"
            checked={f.loopable}
            onChange={() => store.updateFilters({ loopable: !f.loopable })}
          />{" "}
          loopable
        </label>
        <label class="inline">
          <input
            type="checkbox"
            checked={f.singleEvent}
            onChange={() => store.updateFilters({ singleEvent: !f.singleEvent })}
          />{" "}
          single event
        </label>
      </div>
    </section>
  );
}
