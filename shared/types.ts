/** Shapes shared by the server, the MCP tools and the website. */

export const STATUSES = ["new", "skipped", "applied", "in_process", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const VIEWS = ["to_review", "shortlist", "applied", "skipped", "rejected", "all"] as const;
export type View = (typeof VIEWS)[number];

/** What to keep. Every field has a default and every one can be changed or emptied. */
export type Filters = {
  /** Keep titles containing any of these phrases. Empty keeps every title. */
  titles: string[];
  /** Drop titles containing any of these phrases. */
  skip_titles: string[];
  /** Keep on-site and hybrid jobs. */
  onsite: boolean;
  /** On-site or hybrid jobs must be in one of these places. Empty means anywhere. */
  places: string[];
  /** Keep remote jobs. */
  remote: boolean;
  /** Remote jobs must be open to one of these regions. Empty means any region. */
  remote_regions: string[];
  /** Keep remote jobs that don't say where they are open to ("Remote"). */
  remote_unclear: boolean;
  /** Keep jobs posted within this many days. null keeps any age. */
  posted_within_days: number | null;
  /** Keep jobs whose board gives no posting date. */
  show_undated: boolean;
  /** Drop jobs whose description mentions any of these phrases. */
  skip_if_description: string[];
  /** Drop jobs from these companies. */
  skip_companies: string[];
};

export type Settings = {
  filters: Filters;
  /** The person's resume and what they want, as plain text. Hunt stores it for agents; it does nothing with it. */
  profile: string;
};

export type Verdict = { score: number; note: string; at: string };

export type Contact = {
  id: number;
  name: string;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_verified: boolean | null;
  note: string | null;
  contacted_at: string | null;
};

export type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string | null;
  url: string;
  apply_url: string;
  source: string;
  posted_at: string | null;
  posted_days_ago: number | null;
  first_seen_at: string;
  closed: boolean;
  status: Status;
  verdict: Verdict | null;
  follow_up_at: string | null;
  contacts: number;
  /** Start of the description, for a quick read. */
  excerpt: string;
};

export type TimelineItem = { kind: string; text: string; by: string | null; at: string };

export type JobDetail = JobRow & {
  company_domain: string | null;
  department: string | null;
  description: string;
  description_html?: string | null;
  /** Whether the job passes the saved filters, and why not. */
  filter: { ok: boolean; reason: string | null };
  contacts_list: Contact[];
  timeline: TimelineItem[];
};

export type ViewCounts = Record<View, number>;

export type ListJobsResult = {
  total: number;
  counts: ViewCounts;
  jobs: JobRow[];
};

export type SourceKind = "company" | "board" | "feed";
export type SourceState = "queued" | "active" | "paused" | "error";

export type SourceRow = {
  id: number;
  kind: SourceKind;
  name: string;
  /** Job-board system for companies (greenhouse, lever, ashby, ...), board id for boards. */
  system: string | null;
  url: string | null;
  tags: string[];
  state: SourceState;
  last_read_at: string | null;
  last_error: string | null;
  /** Postings on the board at the last read. */
  listings: number;
  /** Open jobs from this source that pass your filters. */
  matching: number;
};

export type ListSourcesResult = {
  total: number;
  counts: Record<SourceState, number>;
  sources: SourceRow[];
};

export type AddSourceResult = {
  input: string;
  status: "added" | "exists" | "queued" | "error";
  message: string;
  source?: { id: number; name: string; kind: SourceKind; system: string | null };
};

export type Today = {
  setup: { ready: boolean; missing: string[] };
  jobs: {
    new_24h: number;
    to_review: number;
    shortlist: number;
    applied: number;
    in_process: number;
  };
  follow_ups_due: { id: string; title: string; company: string; status: Status; follow_up_at: string }[];
  sources: {
    active: number;
    queued: number;
    paused: number;
    errors: number;
    last_read_at: string | null;
    /** Minutes for one full pass over every active source. */
    pass_minutes: number;
  };
  /** Jobs first seen per day, last 14 days (only jobs that pass your filters now). */
  days: { day: string; jobs: number }[];
};

export type StarterList = { id: string; label: string; description: string; companies: number };

export type Me = {
  authed: boolean;
  /** HUNT_TOKEN is not set on the server. */
  needs_token: boolean;
  dev: boolean;
  version: string;
  mcp_url: string;
  lists: StarterList[];
};
