import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "hunt-theme";
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let choice = read();
const listeners = new Set<() => void>();

/** A theme flip changes every color at once; with transitions on, the page smears instead of snapping. */
function withoutTransitions(fn: () => void) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none !important}";
  document.head.append(style);
  fn();
  void document.body.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
}

function apply() {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function initTheme() {
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => withoutTransitions(() => {}));
}

export function cycleTheme() {
  choice = NEXT[choice];
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
  withoutTransitions(apply);
  listeners.forEach((l) => l());
}

export const useTheme = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => choice,
  );
