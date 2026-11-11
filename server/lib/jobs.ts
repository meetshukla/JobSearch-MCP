/** Jobs: the list, one job in full, tracking, and the daily agenda. */
import { all, get, run, tx, parseJson } from "../db.ts";
import { getSettings } from "../settings.ts";
import { matches, ageDays } from "../filters.ts";
import { isoAt, nowIso } from "../schema.ts";
import { addEvent, broadcast } from "./events.ts";
import { passMinutes } from "./collect.ts";
import { VIEWS, type Contact, type Filters, type JobDetail, type JobRow, type ListJobsResult, type Status, type Today, type View, type ViewCounts } from "../../shared/types.ts";

const LIGHT = `id, company, company_domain, title, location, remote, department, salary, url, apply_url, source, posted_at, first_seen_at,
  closed_at, status, status_at, verdict_score, verdict_note, verdict_at, verdict_by, pinned, substr(description_text, 1, 400) AS head,
  (SELECT COUNT(*) FROM contacts c WHERE c.job_id = jobs.id) AS contacts_n`;

export const STATUS_LABEL: Record<Status, string> = { new: "new", skipped: "skipped", applied: "applied", in_process: "in process", rejected: "rejected" };

function viewOf(j: { status: Status }): View {
  if (j.status === "new") return "jobs";
  if (j.status === "skipped") return "skipped";
  return "applied";
}

function toRow(j: any): JobRow {
  const age = ageDays(j.posted_at);
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location || "",
    remote: Boolean(j.remote),
    salary: j.salary ?? null,
    url: j.url,
    apply_url: j.apply_url || j.url,
    source: j.source,
    posted_at: j.posted_at ?? null,
    posted_days_ago: age == null ? null : Math.max(0, Math.round(age * 10) / 10),
    first_seen_at: j.first_seen_at,
    closed: Boolean(j.closed_at),
    status: j.status,
    status_at: j.status_at ?? null,
    verdict: j.verdict_score == null ? null : { score: j.verdict_score, note: j.verdict_note ?? "", at: j.verdict_at, by: j.verdict_by ?? null },
    contacts: j.contacts_n ?? 0,
    excerpt: String(j.head ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

const asListing = (j: any) => ({ ...j, remote: Boolean(j.remote), pinned: Boolean(j.pinned) });

/**
 * Every job you can see. Jobs you or your agent acted on (a status, a verdict, contacts, added
 * by hand) always show, closed or not. Untouched jobs show while open and passing the filters.
 */
function visible(f: Filters, ignoreFilters = false) {
  const desc = f.skip_if_description.length > 0;
  const out: { j: any; view: View }[] = [];
  for (const j of all<any>(`SELECT ${LIGHT}${desc ? ", description_text" : ""} FROM jobs`)) {
    const tracked = j.status !== "new" || j.verdict_score != null || j.pinned || j.contacts_n > 0;
    if (!tracked && !ignoreFilters && (j.closed_at || !matches(asListing(j), f).ok)) continue;
    out.push({ j, view: viewOf(j) });
  }
  return out;
}

const emptyCounts = (): ViewCounts => Object.fromEntries(VIEWS.map((v) => [v, 0])) as ViewCounts;
function countViews(rows: { j: any; view: View }[]) {
  const counts = emptyCounts();
  for (const { view } of rows) counts[view]++;
  return counts;
}

/** Applied: in process, then applied, then rejected; newest change first within each. */
const STAGE: Record<string, number> = { in_process: 1, applied: 2, rejected: 3 };

export type ListQuery = {
  view?: View;
  query?: string;
  company?: string;
  remote_only?: boolean;
  /** Replaces the saved "posted within" for this list only. null = any age. */
  posted_within_days?: number | null;
  ignore_filters?: boolean;
  /** Jobs view: only jobs without a score, the agent's review queue. */
  unscored_only?: boolean;
  sort?: "posted" | "verdict" | "seen" | "updated";
  limit?: number;
  offset?: number;
};

export function listJobs(q: ListQuery = {}, filters?: Filters): ListJobsResult {
  const view = q.view ?? "jobs";
  let f = filters ?? getSettings().filters;
  if (q.posted_within_days !== undefined) f = { ...f, posted_within_days: q.posted_within_days };
  const rows = visible(f, q.ignore_filters);
  const counts = countViews(rows);
  const text = q.query?.trim().toLowerCase();
  const company = q.company?.trim().toLowerCase();
  const picked: any[] = [];
  for (const { j, view: v } of rows) {
    if (v !== view) continue;
    if (q.unscored_only && j.verdict_score != null) continue;
    if (text && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(text)) continue;
    if (company && !j.company.toLowerCase().includes(company)) continue;
    if (q.remote_only && !j.remote && !/remote/i.test(j.location)) continue;
    picked.push(j);
  }
  const sort = q.sort ?? (view === "jobs" ? "verdict" : "updated");
  const time = (s: string | null) => (s ? Date.parse(s) || 0 : 0);
  picked.sort((a, b) => {
    if (view === "applied" && !q.sort) return (STAGE[a.status] ?? 4) - (STAGE[b.status] ?? 4) || time(b.status_at) - time(a.status_at);
    if (sort === "verdict") return (b.verdict_score ?? -1) - (a.verdict_score ?? -1) || time(b.posted_at) - time(a.posted_at);
    if (sort === "seen") return time(b.first_seen_at) - time(a.first_seen_at);
    if (sort === "updated") return time(b.status_at ?? b.first_seen_at) - time(a.status_at ?? a.first_seen_at);
    return time(b.posted_at) - time(a.posted_at) || time(b.first_seen_at) - time(a.first_seen_at);
  });
  const offset = q.offset ?? 0;
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  return { total: picked.length, counts, jobs: picked.slice(offset, offset + limit).map(toRow) };
}

function contactsFor(jobId: string): Contact[] {
  return all<any>("SELECT * FROM contacts WHERE job_id = ? ORDER BY id", jobId).map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    linkedin_url: c.linkedin_url,
    email: c.email,
    email_verified: c.email_verified == null ? null : Boolean(c.email_verified),
    note: c.note,
    contacted_at: c.contacted_at,
  }));
}

export function getJob(id: string, opts: { html?: boolean; maxChars?: number } = {}): JobDetail | null {
  const j = get<any>(`SELECT ${LIGHT}, description_text, description_html FROM jobs WHERE id = ?`, id);
  if (!j) return null;
  const f = getSettings().filters;
  const m = j.closed_at ? { ok: false, reason: "Closed: it's no longer on the board" } : j.status !== "new" ? { ok: true, reason: null } : matches(asListing(j), f);
  return {
    ...toRow(j),
    company_domain: j.company_domain ?? null,
    department: j.department ?? null,
    description: String(j.description_text ?? "").slice(0, opts.maxChars ?? 20_000),
    ...(opts.html ? { description_html: j.description_html ?? null } : {}),
    filter: { ok: m.ok, reason: m.reason },
    contacts_list: contactsFor(id),
    timeline: all<any>("SELECT kind, text, by, data, created_at FROM events WHERE job_id = ? ORDER BY id DESC LIMIT 60", id).map((e) => ({
      kind: e.kind,
      text: e.text,
      by: e.by,
      at: e.created_at,
      data: parseJson(e.data, null),
    })),
  };
}

export type ContactInput = {
  name: string;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
  note?: string | null;
  contacted_at?: string | null;
};

export type UpdateJob = {
  job_id: string;
  status?: Status;
  verdict?: { score: number; note: string } | null;
  note?: string;
  contacts?: ContactInput[];
};

function linkedin(u?: string | null) {
  const v = u?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/linkedin\.com\//i.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  return `https://www.linkedin.com/in/${v.replace(/^@/, "")}`;
}

/** A contacted date is a day, not an instant, so no time zone shifts it. */
function dayOrThrow(v: string, what: string) {
  const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (m && !Number.isNaN(Date.parse(m[1]))) return m[1];
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`${what} must be a date like 2026-11-20.`);
  return isoAt(t).slice(0, 10);
}

export function updateJob(u: UpdateJob, by: "you" | "agent") {
  const j = get<any>("SELECT id, status FROM jobs WHERE id = ?", u.job_id);
  if (!j) throw new Error(`No job with id ${u.job_id}. Ids come from list_jobs.`);
  const who = by === "you" ? "You" : "Your agent";
  const now = nowIso();
  tx(() => {
    if (u.status && u.status !== j.status) {
      run("UPDATE jobs SET status = ?, status_at = ? WHERE id = ?", u.status, now, j.id);
      addEvent(j.id, "status", `${who} marked it ${STATUS_LABEL[u.status]}`, by, { status: u.status });
    }
    if (u.verdict === null) {
      run("UPDATE jobs SET verdict_score = NULL, verdict_note = NULL, verdict_at = NULL, verdict_by = NULL WHERE id = ?", j.id);
      addEvent(j.id, "verdict", `${who} cleared the verdict`, by, { score: null });
    } else if (u.verdict) {
      const score = Math.max(0, Math.min(100, Math.round(u.verdict.score)));
      run("UPDATE jobs SET verdict_score = ?, verdict_note = ?, verdict_at = ?, verdict_by = ? WHERE id = ?", score, u.verdict.note.trim(), now, by, j.id);
      addEvent(j.id, "verdict", `${score}/100. ${u.verdict.note.trim()}`, by, { score });
    }
    for (const c of u.contacts ?? []) {
      const name = c.name?.trim();
      if (!name) continue;
      const li = linkedin(c.linkedin_url);
      const ex =
        (li && get<any>("SELECT * FROM contacts WHERE job_id = ? AND linkedin_url = ?", j.id, li)) ||
        get<any>("SELECT * FROM contacts WHERE job_id = ? AND lower(name) = lower(?)", j.id, name);
      const contacted = c.contacted_at ? dayOrThrow(c.contacted_at, "contacted_at") : null;
      if (ex) {
        run(
          `UPDATE contacts SET name = ?, title = COALESCE(?, title), linkedin_url = COALESCE(?, linkedin_url), email = COALESCE(?, email),
             email_verified = COALESCE(?, email_verified), note = COALESCE(?, note), contacted_at = COALESCE(?, contacted_at) WHERE id = ?`,
          name, c.title ?? null, li, c.email ?? null, c.email_verified == null ? null : c.email_verified ? 1 : 0, c.note ?? null, contacted, ex.id,
        );
        if (contacted && !ex.contacted_at) addEvent(j.id, "contact", `Contacted ${name}`, by, { name, date: contacted });
      } else {
        run(
          "INSERT INTO contacts (job_id, name, title, linkedin_url, email, email_verified, note, contacted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          j.id, name, c.title ?? null, li, c.email ?? null, c.email_verified == null ? null : c.email_verified ? 1 : 0, c.note ?? null, contacted,
        );
        addEvent(j.id, "contact", contacted ? `Contacted ${name}` : `Added ${name}${c.title ? `, ${c.title}` : ""}`, by, { name, date: contacted });
      }
    }
    if (u.note?.trim()) addEvent(j.id, "note", u.note.trim(), by);
    run("UPDATE jobs SET updated_at = ? WHERE id = ?", now, j.id);
  });
  broadcast("job");
  broadcast("jobs");
  return getJob(j.id, { maxChars: 0 });
}

/** What setup still needs, for the website's checklist and for agents through get_settings. */
export function setupStatus(): Today["setup"] {
  const { profile, filters: f } = getSettings();
  const readable = get<{ n: number }>("SELECT COUNT(*) n FROM sources WHERE kind IN ('company','feed') AND state <> 'paused'")!.n;
  const missing: Today["setup"]["missing"] = [];
  if (!profile.trim()) missing.push({ id: "profile", text: "Add the person's profile (resume, and what they want and won't accept) with update_settings.profile." });
  if (!readable) missing.push({ id: "sources", text: "Add company job boards with add_sources (company names, careers page URLs, or the starter list)." });
  if ((f.onsite && !f.places.length) || (f.remote && !f.remote_regions.length))
    missing.push({ id: "where", text: "Say where the person can work: filters.places for on-site or hybrid, filters.remote_regions for remote. Empty keeps every place." });
  return { ready: missing.length === 0, missing };
}

/** The website's summary: counts and source health. */
export function today(): Today {
  const rows = visible(getSettings().filters);
  const since24h = isoAt(Date.now() - 86_400_000);
  const st = Object.fromEntries(all<any>("SELECT state, COUNT(*) n FROM sources GROUP BY state").map((r) => [r.state, r.n]));
  return {
    setup: setupStatus(),
    counts: countViews(rows),
    new_24h: rows.filter(({ j }) => j.status === "new" && j.first_seen_at >= since24h).length,
    sources: {
      active: st.active ?? 0,
      queued: st.queued ?? 0,
      paused: st.paused ?? 0,
      errors: st.error ?? 0,
      last_read_at: get<{ t: string | null }>("SELECT MAX(last_read_at) t FROM sources")?.t ?? null,
      pass_minutes: passMinutes(),
    },
  };
}
