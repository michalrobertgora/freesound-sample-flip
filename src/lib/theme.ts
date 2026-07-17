/**
 * Theme state: follows the system by default; a manual toggle pins an
 * explicit choice in localStorage ("light" | "dark", absent = system).
 * The resolved theme lands as a `dark` class on <html> — index.html sets
 * the same class pre-paint so first render never flashes.
 */

import { computed, effect, signal, type ReadonlySignal } from "@preact/signals";

const STORAGE = "theme";

type ThemeChoice = "light" | "dark" | "system";

const stored = localStorage.getItem(STORAGE);
const choice = signal<ThemeChoice>(
  stored === "light" || stored === "dark" ? stored : "system",
);

const media = matchMedia("(prefers-color-scheme: dark)");
const systemDark = signal(media.matches);
media.addEventListener("change", (e) => {
  systemDark.value = e.matches;
});

export const isDark: ReadonlySignal<boolean> = computed(
  () => choice.value === "dark" || (choice.value === "system" && systemDark.value),
);

effect(() => {
  document.documentElement.classList.toggle("dark", isDark.value);
});

/** Flip to the opposite of what's showing and persist that as explicit. */
export function toggleTheme(): void {
  const next = isDark.value ? "light" : "dark";
  choice.value = next;
  localStorage.setItem(STORAGE, next);
}
