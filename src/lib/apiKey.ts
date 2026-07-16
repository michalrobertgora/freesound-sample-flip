/**
 * The Freesound API key: localStorage-backed, never part of URL state.
 * (Keeping it out of the app store is deliberate — the store serializes
 * its whole state into shareable URLs, and the key must never travel.)
 */

import { signal, type ReadonlySignal } from "@preact/signals";

const KEY_STORAGE = "freesound-api-key";

const apiKeySignal = signal(localStorage.getItem(KEY_STORAGE) ?? "");

export const apiKey: ReadonlySignal<string> = apiKeySignal;

export function saveApiKey(value: string): void {
  const v = value.trim();
  apiKeySignal.value = v;
  if (v) localStorage.setItem(KEY_STORAGE, v);
  else localStorage.removeItem(KEY_STORAGE);
}
