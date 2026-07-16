import type { ReadonlySignal } from "@preact/signals";
import type { FreesoundError } from "../lib/freesound";
import { errorMessage } from "./errorMessage";

export type CountState =
  | { status: "no-key" }
  | { status: "loading" }
  | { status: "ok"; count: number }
  | { status: "error"; error: FreesoundError };

export function CountSection({
  count,
  generateDisabled,
  onRetry,
  onGenerate,
}: {
  count: ReadonlySignal<CountState>;
  generateDisabled: ReadonlySignal<boolean>;
  onRetry: () => void;
  onGenerate: () => void;
}) {
  const c = count.value;
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
          <button onClick={onRetry}>Try again</button>
        </>
      )}
      <p>
        <button class="generate" disabled={generateDisabled.value} onClick={onGenerate}>
          Generate set
        </button>
      </p>
    </section>
  );
}
