/**
 * API-key UX (ticket 11): while no key is stored, `KeyOnboarding` is the
 * main column's focal point and the controls pane is gated; once a key
 * exists it shrinks to a one-line `ApiKeyControls` button that reopens
 * the editor to replace or clear the key.
 */

import { effect, signal } from "@preact/signals";
import { apiKey, saveApiKey } from "../lib/apiKey";
import { APPLY_URL } from "../lib/freesound";

const editorOpen = signal(false);

// Clearing the key re-gates the app; the editor must not linger open
// behind the onboarding card for the next key that gets entered.
effect(() => {
  if (apiKey.value === "") editorOpen.value = false;
});

/** Freesound keys are ~40 chars; below this a keystroke can't be one. */
const LOOKS_LIKE_KEY = 20;

function KeyInput() {
  return (
    <input
      type="password"
      class="key-input"
      value={apiKey.value}
      placeholder="Paste your API key"
      autocomplete="off"
      // Saving on every keystroke would unmount this input (the key gate
      // swaps whole panes) after the first typed character. Commit
      // immediately only when the value looks like a real key (a paste),
      // otherwise on Enter/blur.
      onInput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        if (v.trim().length >= LOOKS_LIKE_KEY) saveApiKey(v);
      }}
      onChange={(e) => saveApiKey((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") saveApiKey((e.target as HTMLInputElement).value);
      }}
    />
  );
}

function StorageNote() {
  return (
    <p class="muted small">
      Stored only in this browser — never in shared links.{" "}
      <a href={APPLY_URL} target="_blank" rel="noreferrer">
        Get a key from Freesound
      </a>
    </p>
  );
}

/** First-run focal point, rendered in the main column while no key exists. */
export function KeyOnboarding() {
  return (
    <main class="results">
      <div class="key-onboarding">
        <h2>Connect Freesound</h2>
        <p class="muted">
          Cotygodniowy Flip needs a free Freesound API key to fetch this
          week's samples. Paste yours below and the controls unlock.
        </p>
        <KeyInput />
        <StorageNote />
      </div>
    </main>
  );
}

/** Sidebar affordance once a key exists: tiny status row, editor on demand. */
export function ApiKeyControls() {
  if (apiKey.value === "") return null;
  if (!editorOpen.value) {
    return (
      <p class="key-status">
        <button class="small" onClick={() => (editorOpen.value = true)}>
          API key ✓ · replace
        </button>
      </p>
    );
  }
  return (
    <section>
      <h2>Freesound API key</h2>
      <KeyInput />
      <StorageNote />
      <button class="small" onClick={() => (editorOpen.value = false)}>
        Done
      </button>
    </section>
  );
}
