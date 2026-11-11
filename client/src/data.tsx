import { createContext, useContext, useSyncExternalStore } from "react";
import type { Me, Status, Today, ViewCounts } from "../../shared/types.ts";
import type { SettingsResult } from "./api.ts";

export type PaletteMode = "all" | "track";

/** What every screen can read: who is signed in, the view counts, today's agenda and the settings. */
export type AppData = {
  me: Me;
  counts: ViewCounts | undefined;
  today: Today | undefined;
  settings: SettingsResult | undefined;
  openPalette: (mode: PaletteMode) => void;
  openShortcuts: () => void;
  signOut: () => void;
};

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData() {
  const v = useContext(AppDataContext);
  if (!v) throw new Error("useAppData outside the shell");
  return v;
}

/** The job open on screen, so the command menu can act on it. */
type ActiveJob = {
  id: string;
  title: string;
  company: string;
  status: Status;
  applyUrl: string;
  followUp: string | null;
  setStatus: (s: Status) => void;
  setFollowUp: (date: string | null) => void;
  focusNote: () => void;
};

let active: ActiveJob | null = null;
const listeners = new Set<() => void>();

export function setActiveJob(job: ActiveJob | null) {
  active = job;
  listeners.forEach((l) => l());
}

export const useActiveJob = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => active,
  );
