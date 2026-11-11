import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export const THEMES: ThemeChoice[] = ["system", "light", "dark"];
const KEY = "hunt-theme";
const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
/** The phone's status bar matches the top bar, which uses the panel color. */
const BAR = { light: "#ffffff", dark: "#131313" };

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
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = BAR[choice === "system" ? scheme : choice];
  }
}

export function initTheme() {
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => withoutTransitions(() => {}));
}

export function setTheme(next: ThemeChoice) {
  choice = next;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
  withoutTransitions(apply);
  listeners.forEach((l) => l());
}

export const cycleTheme = () => setTheme(NEXT[choice]);

export const THEME_LABEL: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };

export const useTheme = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => choice,
  );
