/**
 * Browser-side history of generated sets. localStorage only — ephemeral by
 * design; losing it on a cache clear is acceptable. Each resolved set is saved
 * with its share URL, the sound names, and their tags. Deduped by URL, so
 * reopening the same locked link doesn't stack.
 *
 * Pure helpers (`mergeEntry`, `entryFromSet`) hold the logic and are
 * unit-tested; the live signal + `saveSet`/`clearHistory` wrap them around
 * localStorage.
 */

import { signal, type ReadonlySignal } from "@preact/signals";
import type { FreesoundSound, LockedSlot } from "./resolveSet";

const STORAGE_KEY = "freesound-flip-history";
const CAP = 30;

export interface HistorySound {
  name: string;
  tags: string[];
}

export interface HistoryEntry {
  /** Full share URL (with `ids`) that reopens this exact set. */
  url: string;
  week: string;
  /** Epoch ms when saved. */
  savedAt: number;
  sounds: HistorySound[];
}

/** Project a resolved set into a history entry, dropping missing-sound slots. */
export function entryFromSet(
  url: string,
  week: string,
  slots: LockedSlot[],
  savedAt = Date.now(),
): HistoryEntry {
  return {
    url,
    week,
    savedAt,
    sounds: slots
      .filter((s): s is FreesoundSound => !("missing" in s))
      .map((s) => ({ name: s.name, tags: s.tags })),
  };
}

/** Prepend `entry`, drop any existing entry with the same URL, cap the length. */
export function mergeEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  cap = CAP,
): HistoryEntry[] {
  return [entry, ...list.filter((e) => e.url !== entry.url)].slice(0, cap);
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

const historySignal = signal<HistoryEntry[]>(load());

/** Saved sets, most-recent first. */
export const history: ReadonlySignal<HistoryEntry[]> = historySignal;

export function saveSet(entry: HistoryEntry): void {
  const next = mergeEntry(historySignal.value, entry);
  historySignal.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable — the in-memory signal still reflects it
  }
}

export function clearHistory(): void {
  historySignal.value = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
