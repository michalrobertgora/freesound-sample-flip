import type { FreesoundError } from "../lib/freesound";

/** Maps every member of the error taxonomy to distinct, actionable copy. */
export function errorMessage(error: FreesoundError) {
  switch (error.kind) {
    case "invalid-key":
      return (
        <p class="status error">
          The sample service is temporarily unavailable (the server's Freesound
          access was rejected). This is on our end — please try again later.
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
