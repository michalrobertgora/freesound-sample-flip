/**
 * History popover: opens from a button on the Copy-set-link line and lists
 * the sets saved in the browser (lib/history). Each entry reopens its set.
 * Reuses the `.pop` popover panel and `.tag` styling.
 */

import { clearHistory, history, type HistoryEntry } from "../lib/history";

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Up to `limit` distinct tags across the set's sounds. */
function uniqueTags(entry: HistoryEntry, limit = 6): string[] {
  const seen = new Set<string>();
  for (const s of entry.sounds) for (const t of s.tags) seen.add(t);
  return [...seen].slice(0, limit);
}

export function HistoryOverlay() {
  const entries = history.value;
  return (
    <details class="history-pop">
      <summary>History{entries.length > 0 ? ` (${entries.length})` : ""}</summary>
      <div class="pop history-panel">
        {entries.length === 0 ? (
          <p class="muted small">No saved sets yet — generate one and it lands here.</p>
        ) : (
          <>
            {entries.map((e) => {
              const tags = uniqueTags(e);
              return (
                <button
                  type="button"
                  class="history-entry"
                  key={e.url}
                  onClick={() => {
                    location.href = e.url;
                  }}
                >
                  <span class="muted small">
                    {e.week} · {formatWhen(e.savedAt)}
                  </span>
                  <span class="history-names small">
                    {e.sounds.map((s) => s.name).join(", ") || "(no sounds)"}
                  </span>
                  {tags.length > 0 && (
                    <span class="tags small">
                      {tags.map((t) => (
                        <span class="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
            <button type="button" class="small history-clear" onClick={() => clearHistory()}>
              Clear history
            </button>
          </>
        )}
      </div>
    </details>
  );
}
