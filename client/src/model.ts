import { CircleSlash, Inbox, Send, type LucideIcon } from "lucide-react";
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


export type JobGroup = { key: string; label: string; status?: Status; rows: JobRow[] };

export type ViewId = View;

export type ViewDef = {
  id: ViewId;
  path: string;
  label: string;
  /** Label in the phone tab bar. */
  short: string;
  icon: LucideIcon;
  /** The list_jobs view that feeds this one. */
  server: View;
  group?: (rows: JobRow[]) => JobGroup[];
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
  jobs: {
    id: "jobs",
    path: "jobs",
    label: "Jobs",
    short: "Jobs",
    icon: Inbox,
    server: "jobs",
    // The server sends scored jobs first, best first, then the rest newest first.
    group: (rows) => {
      const scored = rows.filter((j) => j.verdict);
      const rest = rows.filter((j) => !j.verdict);
      return [...(scored.length ? [{ key: "scored", label: "Scored", rows: scored }] : []), ...groupBy(rest, (j) => postedGroup(j.posted_at))];
    },
    count: (c) => c?.jobs,
    empty: { title: "All caught up", text: "New jobs that pass your filters land here as Hunt reads your sources." },
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
        (j) =>
          j.status === "in_process"
            ? { key: "in_process", label: "In process", status: "in_process" }
            : j.status === "rejected"
              ? { key: "rejected", label: "Rejected", status: "rejected" }
              : { key: "applied", label: "Applied", status: "applied" },
        ["in_process", "applied", "rejected"],
      ),
    count: (c) => c?.applied,
    empty: { title: "No applications yet", text: "Mark a job Applied and it moves here, out of Jobs." },
  },
  skipped: {
    id: "skipped",
    path: "skipped",
    label: "Skipped",
    short: "Skipped",
    icon: CircleSlash,
    server: "skipped",
    count: (c) => c?.skipped,
    empty: { title: "Nothing skipped", text: "Jobs you or your agent pass on go here, so they never come back to Jobs." },
  },
};

export const VIEW_ORDER: ViewId[] = ["jobs", "applied", "skipped"];
export const TAB_VIEWS: ViewId[] = VIEW_ORDER;

export const viewByPath = (path: string | undefined) => VIEW_ORDER.find((v) => VIEWS[v].path === path);

/** The view a job lives in. */
export function viewForStatus(status: Status): ViewId {
  if (status === "new") return "jobs";
  if (status === "skipped") return "skipped";
  return "applied";
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
