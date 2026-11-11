import type { Status, View } from "../../shared/types.ts";

export const STATUS: Record<Status, { label: string; action: string; tone: string }> = {
  new: { label: "New", action: "New", tone: "neutral" },
  skipped: { label: "Skipped", action: "Skip", tone: "muted" },
  applied: { label: "Applied", action: "Applied", tone: "blue" },
  in_process: { label: "In process", action: "In process", tone: "green" },
  rejected: { label: "Rejected", action: "Rejected", tone: "red" },
};

export const VIEW_META: Record<View, { label: string; empty: string; hint: string }> = {
  to_review: {
    label: "To review",
    empty: "All caught up",
    hint: "New jobs that pass your filters land here as Hunt reads your sources.",
  },
  shortlist: {
    label: "Shortlist",
    empty: "Nothing on the shortlist",
    hint: "Jobs with a verdict that you haven't acted on yet. Your agent fills this as it reviews.",
  },
  applied: { label: "Applied", empty: "No applications yet", hint: "Mark a job Applied or In process and it moves here." },
  skipped: { label: "Skipped", empty: "Nothing skipped", hint: "Jobs you or your agent pass on end up here." },
  rejected: { label: "Rejected", empty: "No rejections", hint: "Mark a job Rejected to keep a record of it here." },
  all: { label: "All", empty: "No jobs yet", hint: "Every job you can see, whatever its status." },
};

export const scoreTone = (score: number) => (score >= 75 ? "good" : score >= 50 ? "ok" : "low");

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3h", "2d", "5w": compact ages for dense rows. */
export function shortAge(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, (now - t) / 60_000);
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  const h = min / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 14) return `${Math.round(d)}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}

/** "2 hours ago", "yesterday", "3 weeks ago". */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = (t - now) / 1000;
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86_400 * 14) return rtf.format(Math.round(s / 86_400), "day");
  if (abs < 86_400 * 60) return rtf.format(Math.round(s / (86_400 * 7)), "week");
  return rtf.format(Math.round(s / (86_400 * 30)), "month");
}

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dayYearFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Dates stored as "YYYY-MM-DD" or an ISO timestamp, shown as "Nov 12" (with the year when it isn't this year). */
export function day(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
}

export const fullDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fullFmt.format(d);
};

/** Today's date in the person's timezone, as "YYYY-MM-DD". */
export function todayIso(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const isDue = (followUp: string | null) => followUp != null && followUp.slice(0, 10) <= todayIso();

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const byLabel = (by: string | null) => (by === "you" ? "You" : by === "agent" ? "Your agent" : "Hunt");
