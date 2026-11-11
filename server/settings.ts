import { get, run, parseJson } from "./db.ts";
import type { Filters, Settings } from "../shared/types.ts";

/** Defaults for a new install. Opinions, not rules: every one can be changed or emptied. */
export const DEFAULT_FILTERS: Filters = {
  titles: ["software engineer", "software developer"],
  skip_titles: ["intern", "internship", "co-op", "new grad", "sales engineer", "solutions engineer", "support engineer"],
  onsite: true,
  places: [],
  remote: true,
  remote_regions: [],
  remote_unclear: true,
  posted_within_days: 7,
  show_undated: false,
  skip_if_description: [],
  skip_companies: [],
};

const LISTS: (keyof Filters)[] = ["titles", "skip_titles", "places", "remote_regions", "skip_if_description", "skip_companies"];

const cleanList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200) : undefined;

/** Fill in defaults and drop anything unknown, so stored settings always have the current shape. */
export function normalizeFilters(raw: Partial<Filters> | undefined, base: Filters = DEFAULT_FILTERS): Filters {
  const out: Filters = { ...base };
  if (!raw || typeof raw !== "object") return out;
  for (const k of LISTS) {
    const v = cleanList((raw as any)[k]);
    if (v) (out as any)[k] = v;
  }
  for (const k of ["onsite", "remote", "remote_unclear", "show_undated"] as const) {
    if (typeof raw[k] === "boolean") out[k] = raw[k];
  }
  if ("posted_within_days" in raw) {
    const d = raw.posted_within_days;
    out.posted_within_days = d == null || !Number.isFinite(Number(d)) || Number(d) <= 0 ? null : Math.round(Number(d));
  }
  return out;
}

export function getSettings(): Settings {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'settings'");
  const s = parseJson<Partial<Settings>>(row?.value, {});
  return { filters: normalizeFilters(s.filters), profile: typeof s.profile === "string" ? s.profile : "" };
}

export function saveSettings(next: Settings) {
  run(
    "INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(next),
  );
  return next;
}
