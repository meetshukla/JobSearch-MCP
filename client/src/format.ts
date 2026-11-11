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

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's date in the person's timezone, as "YYYY-MM-DD". */
export const todayIso = (offsetDays = 0) => ymd(new Date(Date.now() + offsetDays * 86_400_000));

/** The local calendar day of a timestamp, as "YYYY-MM-DD". */
export function localDay(iso: string) {
  if (iso.length === 10) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : ymd(d);
}

/** "Today", "Tomorrow" or "Nov 18", for follow-up dates. */
export function dueLabel(date: string) {
  const d = date.slice(0, 10);
  if (d === todayIso()) return "Today";
  if (d === todayIso(1)) return "Tomorrow";
  return day(d);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const byLabel = (by: string | null) => (by === "you" ? "You" : by === "agent" ? "Your agent" : "Hunt");

export const isUrl = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
const firstGrapheme = (w: string) => (segmenter ? ([...segmenter.segment(w)][0]?.segment ?? "") : w.charAt(0));

/** First and last word's first letters: "Priya Raman" is "PR", "Jo" is "J". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (!words.length) return "?";
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked.map((w) => firstGrapheme(w).toUpperCase()).join("");
}
