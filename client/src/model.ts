import { CalendarClock, CircleSlash, CircleX, Inbox, Layers, Send, Star, type LucideIcon } from "lucide-react";
import type { JobRow, Status, Today, View, ViewCounts } from "../../shared/types.ts";
import { localDay, todayIso } from "./format.ts";

export const STATUS_ORDER: Status[] = ["new", "applied", "in_process", "skipped", "rejected"];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  applied: "Applied",
  in_process: "In process",
  skipped: "Skipped",
  rejected: "Rejected",
};

type VerdictBand = "strong" | "fair" | "weak";
export const verdictBand = (score: number): VerdictBand => (score >= 75 ? "strong" : score >= 50 ? "fair" : "weak");

export const isDue = (followUp: string | null) => followUp != null && followUp.slice(0, 10) <= todayIso();

export type JobGroup = { key: string; label: string; status?: Status; rows: JobRow[] };

export type ViewId = "review" | "shortlist" | "applied" | "follow_ups" | "skipped" | "rejected" | "all";

export type ViewDef = {
  id: ViewId;
  path: string;
  label: string;
  /** Label in the phone tab bar. */
  short: string;
  icon: LucideIcon;
  /** The list_jobs view that feeds this one. */
  server: View;
  /** Load this many rows at once instead of paging, for views the client filters. */
  limit?: number;
  keep?: (j: JobRow) => boolean;
  group?: (rows: JobRow[]) => JobGroup[];
  sort?: (a: JobRow, b: JobRow) => number;
  count: (c: ViewCounts | undefined, t: Today | undefined) => number | undefined;
  empty: { title: string; text: string };
};

const dayLabel = new Intl.DateTimeFormat("en", { weekday: "long" });
const dateLabel = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });

/** "Today", "Yesterday", a weekday this week, then the date. */
function postedGroup(iso: string | null): { key: string; label: string } {
  if (!iso) return { key: "undated", label: "No posting date" };
  const day = localDay(iso);
  const today = todayIso();
  if (day === today) return { key: day, label: "Today" };
  if (day === todayIso(-1)) return { key: day, label: "Yesterday" };
  const d = new Date(`${day}T12:00:00`);
  if (day > todayIso(-7)) return { key: day, label: dayLabel.format(d) };
  return { key: day, label: dateLabel.format(d) };
}

function groupBy(rows: JobRow[], pick: (j: JobRow) => { key: string; label: string; status?: Status }, order?: string[]) {
  const map = new Map<string, JobGroup>();
  for (const j of rows) {
    const g = pick(j);
    if (!map.has(g.key)) map.set(g.key, { ...g, rows: [] });
    map.get(g.key)!.rows.push(j);
  }
  const groups = [...map.values()];
  if (order) groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return groups;
}

export const VIEWS: Record<ViewId, ViewDef> = {
  review: {
    id: "review",
    path: "review",
    label: "To review",
    short: "Review",
    icon: Inbox,
    server: "to_review",
    group: (rows) => groupBy(rows, (j) => postedGroup(j.posted_at)),
    count: (c) => c?.to_review,
    empty: { title: "All caught up", text: "New jobs that pass your filters land here as Hunt reads your sources." },
  },
  shortlist: {
    id: "shortlist",
    path: "shortlist",
    label: "Shortlist",
    short: "Shortlist",
    icon: Star,
    server: "shortlist",
    count: (c) => c?.shortlist,
    empty: { title: "Nothing on the shortlist", text: "Jobs with a verdict that you haven't acted on yet. Your agent fills this as it reviews." },
  },
  applied: {
    id: "applied",
    path: "applied",
    label: "Applied",
    short: "Applied",
    icon: Send,
    server: "applied",
    group: (rows) =>
      groupBy(
        rows,
        (j) => (j.status === "in_process" ? { key: "in_process", label: "In process", status: "in_process" } : { key: "applied", label: "Applied", status: "applied" }),
        ["in_process", "applied"],
      ),
    count: (c) => c?.applied,
    empty: { title: "No applications yet", text: "Mark a job Applied or In process and it moves here." },
  },
  follow_ups: {
    id: "follow_ups",
    path: "follow-ups",
    label: "Follow-ups",
    short: "Follow-ups",
    icon: CalendarClock,
    server: "applied",
    limit: 200,
    keep: (j) => j.follow_up_at != null,
    sort: (a, b) => (a.follow_up_at ?? "").localeCompare(b.follow_up_at ?? ""),
    group: (rows) => groupBy(rows, (j) => (isDue(j.follow_up_at) ? { key: "due", label: "Due" } : { key: "later", label: "Later" }), ["due", "later"]),
    count: (_c, t) => t?.follow_ups_due.length,
    empty: { title: "No follow-ups set", text: "Give an application a follow-up date and it shows up here when it's due." },
  },
  skipped: {
    id: "skipped",
    path: "skipped",
    label: "Skipped",
    short: "Skipped",
    icon: CircleSlash,
    server: "skipped",
    count: (c) => c?.skipped,
    empty: { title: "Nothing skipped", text: "Jobs you or your agent pass on end up here." },
  },
  rejected: {
    id: "rejected",
    path: "rejected",
    label: "Rejected",
    short: "Rejected",
    icon: CircleX,
    server: "rejected",
    count: (c) => c?.rejected,
    empty: { title: "No rejections", text: "Mark a job Rejected to keep a record of it here." },
  },
  all: {
    id: "all",
    path: "all",
    label: "All jobs",
    short: "All",
    icon: Layers,
    server: "all",
    count: (c) => c?.all,
    empty: { title: "No jobs yet", text: "Every job you can see, whatever its status." },
  },
};

export const VIEW_ORDER: ViewId[] = ["review", "shortlist", "applied", "follow_ups", "skipped", "rejected", "all"];
/** The four views in the phone tab bar; the rest live in the More sheet. */
export const TAB_VIEWS: ViewId[] = ["review", "shortlist", "applied", "follow_ups"];

export const viewByPath = (path: string | undefined) => VIEW_ORDER.find((v) => VIEWS[v].path === path);

/** The view a job lives in, given its status and whether it has a verdict. */
export function viewForStatus(status: Status, hasVerdict: boolean): ViewId {
  if (status === "new") return hasVerdict ? "shortlist" : "review";
  if (status === "in_process") return "applied";
  return status;
}

export type SettingsSection = "connect" | "profile" | "filters" | "sources";
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string; missing?: "profile" | "sources" | "where" }[] = [
  { id: "connect", label: "Connect agent" },
  { id: "profile", label: "Profile", missing: "profile" },
  { id: "filters", label: "Filters", missing: "where" },
  { id: "sources", label: "Sources", missing: "sources" },
];

export const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  workday: "Workday",
  remotive: "Remotive",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  weworkremotely: "We Work Remotely",
  arbeitnow: "Arbeitnow",
  feed: "RSS feed",
  link: "Added by link",
};
