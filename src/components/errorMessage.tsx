import type { FreesoundError } from "../lib/freesound";

/** Maps every member of the error taxonomy to distinct, actionable copy. */
export function errorMessage(error: FreesoundError) {
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
          Something went wrong talking to Freesound: {error.message}. Try
          again — if it keeps happening, check your connection or simplify the
          filters.
        </p>
      );
  }
}
