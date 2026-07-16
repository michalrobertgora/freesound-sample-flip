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

/** Live-verified 2026-07-16: exactly these strings match sounds in the
 * API's license filter ("Attribution Noncommercial" matches nothing). */
const LICENSES: Array<[value: string, label: string]> = [
  ["", "Any"],
  ["Creative Commons 0", "CC0"],
  ["Attribution", "CC-BY"],
  ["Attribution NonCommercial", "CC-BY-NC"],
];

function toggleType(t: string): void {
  const cur = new Set(store.state.value.filters.types);
  if (cur.has(t)) cur.delete(t);
  else cur.add(t);
  store.updateFilters({ types: [...cur] });
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
      <label class="field">
        <span>
          Tags <span class="muted small">(comma-separated)</span>
        </span>
        <input
          key={f.tags.join(",")}
          defaultValue={f.tags.join(", ")}
          placeholder="e.g. field-recording, metal"
          onChange={(e) =>
            store.updateFilters({
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
        <span>License</span>
        <select
          value={f.license}
          onChange={(e) =>
            store.updateFilters({ license: (e.target as HTMLSelectElement).value })
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
