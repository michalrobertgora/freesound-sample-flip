import { currentIsoWeek, shiftIsoWeek } from "../lib/isoWeek";
import { MAX_SAMPLES, MIN_SAMPLES } from "../lib/urlState";
import { store } from "../store";

export function WeekSection() {
  const s = store.state.value;
  return (
    <section>
      <h2>Week</h2>
      <div class="week-row">
        <button
          aria-label="Previous week"
          onClick={() => store.update({ week: shiftIsoWeek(s.week, -1) })}
        >
          ◀
        </button>
        <strong class="week-label">{s.week}</strong>
        <button
          aria-label="Next week"
          onClick={() => store.update({ week: shiftIsoWeek(s.week, 1) })}
        >
          ▶
        </button>
        {s.week !== currentIsoWeek() && (
          <button onClick={() => store.update({ week: currentIsoWeek() })}>
            this week
          </button>
        )}
      </div>
      <div class="field">
        <span>Samples</span>
        <div class="week-row">
          <button
            aria-label="Fewer samples"
            disabled={s.sampleCount <= MIN_SAMPLES}
            onClick={() => store.update({ sampleCount: s.sampleCount - 1 })}
          >
            ◀
          </button>
          <strong class="week-label count-label">{s.sampleCount}</strong>
          <button
            aria-label="More samples"
            disabled={s.sampleCount >= MAX_SAMPLES}
            onClick={() => store.update({ sampleCount: s.sampleCount + 1 })}
          >
            ▶
          </button>
        </div>
      </div>
      <label class="field">
        <span>
          Salt <span class="muted small">(agreed reroll, e.g. take2)</span>
        </span>
        <input
          value={s.salt}
          onInput={(e) => store.update({ salt: (e.target as HTMLInputElement).value })}
        />
      </label>
    </section>
  );
}
