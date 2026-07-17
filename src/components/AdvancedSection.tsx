import type { FilterParams } from "../lib/filters";
import { store } from "../store";

/** Live-verified 2026-07-16: exactly these strings match sounds in the
 * API's license filter ("Attribution Noncommercial" matches nothing). */
const LICENSES: Array<[value: string, label: string]> = [
  ["", "Any"],
  ["Creative Commons 0", "CC0"],
  ["Attribution", "CC-BY"],
  ["Attribution NonCommercial", "CC-BY-NC"],
];

/** Default "recorded near" center: Warsaw. Replaced by use-my-location. */
const DEFAULT_GEO = { lat: 52.2297, lon: 21.0122, radiusKm: 10 };

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function activeAdvancedCount(f: FilterParams): number {
  return [
    f.license !== "",
    f.brightnessMin !== null,
    f.warmthMin !== null,
    f.hardnessMin !== null,
    f.boominessMin !== null,
    f.ratingMin !== null,
    f.createdFrom !== null || f.createdTo !== null,
    f.geo !== null,
  ].filter(Boolean).length;
}

function PerceptualSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label class="field">
      <span>
        {label}: {value === null ? "off" : `≥ ${value}`}
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={value ?? 0}
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          onChange(v === 0 ? null : v);
        }}
      />
    </label>
  );
}

function useMyLocation(): void {
  navigator.geolocation.getCurrentPosition((pos) => {
    const radiusKm = store.state.value.filters.geo?.radiusKm ?? DEFAULT_GEO.radiusKm;
    store.updateFilters({
      geo: {
        lat: round4(pos.coords.latitude),
        lon: round4(pos.coords.longitude),
        radiusKm,
      },
    });
  });
}

function GeoFields() {
  const g = store.state.value.filters.geo;
  if (!g) return null;
  const numField = (
    label: string,
    value: number,
    apply: (v: number) => void,
    step: string,
  ) => (
    <label class="inline-num">
      <span class="muted small">{label}</span>
      <input
        type="number"
        step={step}
        value={String(value)}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) apply(v);
        }}
      />
    </label>
  );
  return (
    <div class="geo-fields">
      {numField("lat", g.lat, (v) => store.updateFilters({ geo: { ...g, lat: round4(v) } }), "0.0001")}
      {numField("lon", g.lon, (v) => store.updateFilters({ geo: { ...g, lon: round4(v) } }), "0.0001")}
      {numField("km", g.radiusKm, (v) => store.updateFilters({ geo: { ...g, radiusKm: Math.max(1, Math.round(v)) } }), "1")}
      <button onClick={useMyLocation}>use my location</button>
    </div>
  );
}

export function AdvancedSection() {
  const f = store.state.value.filters;
  const active = activeAdvancedCount(f);
  return (
    <details class="advanced">
      <summary>
        Advanced {active > 0 && <span class="badge">{active} active</span>}
      </summary>
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
      <PerceptualSlider
        label="Brightness"
        value={f.brightnessMin}
        onChange={(v) => store.updateFilters({ brightnessMin: v })}
      />
      <PerceptualSlider
        label="Warmth"
        value={f.warmthMin}
        onChange={(v) => store.updateFilters({ warmthMin: v })}
      />
      <PerceptualSlider
        label="Hardness"
        value={f.hardnessMin}
        onChange={(v) => store.updateFilters({ hardnessMin: v })}
      />
      <PerceptualSlider
        label="Boominess"
        value={f.boominessMin}
        onChange={(v) => store.updateFilters({ boominessMin: v })}
      />
      <label class="field">
        <span>Minimum rating</span>
        <select
          value={f.ratingMin === null ? "" : String(f.ratingMin)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            store.updateFilters({ ratingMin: v === "" ? null : Number(v) });
          }}
        >
          <option value="">Any</option>
          {["3", "3.5", "4", "4.5"].map((r) => (
            <option value={r} key={r}>
              ≥ {r} stars
            </option>
          ))}
        </select>
      </label>
      <div class="field">
        <span>Uploaded between</span>
        <div class="date-row">
          <input
            type="date"
            value={f.createdFrom ?? ""}
            onChange={(e) =>
              store.updateFilters({
                createdFrom: (e.target as HTMLInputElement).value || null,
              })
            }
          />
          <input
            type="date"
            value={f.createdTo ?? ""}
            onChange={(e) =>
              store.updateFilters({
                createdTo: (e.target as HTMLInputElement).value || null,
              })
            }
          />
        </div>
      </div>
      <div class="field">
        <label class="inline">
          <input
            type="checkbox"
            checked={f.geo !== null}
            onChange={() =>
              store.updateFilters({ geo: f.geo ? null : { ...DEFAULT_GEO } })
            }
          />{" "}
          recorded near…
        </label>
        <GeoFields />
      </div>
    </details>
  );
}
