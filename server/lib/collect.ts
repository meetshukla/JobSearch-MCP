/**
 * The collector. Cloudflare's free plan allows 50 outside requests per run and caps daily database reads
 * and writes, so the Durable Object's alarm runs a small tick every 15 seconds with a request budget:
 *   1. work out the board behind one queued company name or URL (if any)
 *   2. read the company boards that are due, oldest first (each about once an hour)
 *   3. one remote-board search or RSS feed that is due
 *   4. fetch descriptions for stored jobs whose board list doesn't include them
 * Only listings that could pass the filters are stored. Changing the filters reads every source again.
 */
import { all, get, run, tx } from "../db.ts";
import { ADAPTERS, type RawJob } from "../sources/ats.ts";
import { BOARDS } from "../sources/boards.ts";
import { readFeed } from "../sources/feeds.ts";
import { getSettings } from "../settings.ts";
import { matches } from "../filters.ts";
import { isoAt, nowIso } from "../schema.ts";
import { htmlToText, slugify } from "./html.ts";
import { broadcast, type Topic } from "./events.ts";
import { resolveQueued, type SourceDb } from "./sources.ts";
import { UNTOUCHED, sourcesVersion } from "./keep.ts";
import type { Filters } from "../../shared/types.ts";

export const TICK_MS = 15_000;
/** Outside requests per tick, below the free plan's 50 to leave room for retries and redirects. */
const BUDGET = 42;
const MAX_COMPANIES = 6;
const DETAILS_PER_TICK = 6;
const MAX_DETAIL_ATTEMPTS = 3;
const BOARD_QUERY_EVERY_MIN = 60;
const UI_REFRESH_MS = 120_000;
/** Board systems whose job list has no descriptions: those come from one extra request per job. */
const NEEDS_DETAIL = new Set(["greenhouse", "ashby", "smartrecruiters", "workday"]);
const BOARD_COST: Record<string, number> = { remotive: 1, jobicy: 1, himalayas: 3, arbeitnow: 2, weworkremotely: 11 };

export const dedupeKey = (company: string, title: string) => `${slugify(company, 40)}|${slugify(title, 80)}`;

/** Board ids are sometimes whole URLs; keep row ids short and URL-safe. */
export function shortId(ext: string) {
  if (/^[\w.-]{1,40}$/.test(ext)) return ext;
  let a = 0x811c9dc5,
    b = 0x01000193;
  for (let i = 0; i < ext.length; i++) {
    a = Math.imul(a ^ ext.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ ext.charCodeAt(ext.length - 1 - i), 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0").slice(0, 4);
}

class OutOfRequests extends Error {}
const isRequestLimit = (e: any) => /too many subrequests/i.test(String(e?.message || e));

// ---------- the schedule: company boards in the order they're due, kept in memory ----------
// Scanning every source each tick would use most of the free plan's daily reads, so the scan happens
// about once per pass, or right after sources change.
let schedule: { version: number; due: number[]; nextScanAt: number; companies: number } | null = null;

/** Minutes for one pass over every company board at this pace, never under an hour. */
export function passMinutes(companies = schedule?.companies ?? countCompanies()) {
  return Math.max(60, Math.ceil(companies / (4 * (60_000 / TICK_MS))) + 5);
}
const countCompanies = () =>
  get<{ n: number }>("SELECT COUNT(*) n FROM sources WHERE kind = 'company' AND state IN ('active','error') AND key NOT LIKE 'pending:%'")!.n;

function dueCompanies(): number[] {
  const now = Date.now();
  if (!schedule || schedule.version !== sourcesVersion() || (!schedule.due.length && now >= schedule.nextScanAt)) {
    const rows = all<{ id: number; last_read_at: string | null }>(
      "SELECT id, last_read_at FROM sources WHERE kind = 'company' AND state IN ('active','error') AND key NOT LIKE 'pending:%'",
    );
    const pass = passMinutes(rows.length) * 60_000;
    const cutoff = isoAt(now - pass);
    const due = rows.filter((r) => !r.last_read_at || r.last_read_at < cutoff).sort((a, b) => (a.last_read_at ?? "").localeCompare(b.last_read_at ?? ""));
    const oldest = rows.filter((r) => r.last_read_at && r.last_read_at >= cutoff).reduce((m, r) => (r.last_read_at! < m ? r.last_read_at! : m), "9999");
    schedule = {
      version: sourcesVersion(),
      due: due.map((r) => r.id),
      nextScanAt: oldest === "9999" ? now + 60_000 : Math.max(now + 60_000, Date.parse(oldest) + pass),
      companies: rows.length,
    };
  }
  return schedule.due;
}

function companyCost(s: SourceDb, f: Filters) {
  if (s.ats === "smartrecruiters") return Math.min(10, Math.max(1, Math.ceil(s.listings / 100)));
  if (s.ats === "workday") return workdayQueries(f).length * 3;
  return 1;
}

/** Workday boards are searched by keyword, three titles per read, rotating so every title gets its turn. */
function workdayQueries(f: Filters) {
  if (!f.titles.length) return [""];
  const groups = Math.ceil(f.titles.length / 3);
  const g = Math.floor(Date.now() / 3_600_000) % groups;
  return f.titles.slice(g * 3, g * 3 + 3);
}

// ---------- storing listings ----------
type Existing = { id: string; sig: string | null; closed_at: string | null };
type Meta = { id: string; sourceId: number; company: string; domain?: string | null; source: string; needsDetail: boolean; aggregator: boolean };

const sigOf = (r: RawJob) =>
  [r.title, r.location || "", r.remote ? 1 : 0, r.postedAt ?? "", r.url, r.applyUrl ?? "", r.salary ?? "", r.department ?? "", r.descriptionHtml?.length ?? 0].join("|");

function existingFor(sourceId: number) {
  return new Map(all<Existing>("SELECT id, listing_sig AS sig, closed_at FROM jobs WHERE source_id = ?", sourceId).map((e) => [e.id, e]));
}

/** Store a listing that could pass the filters, or refresh one already stored when it changed. */
function store(raw: RawJob, m: Meta, f: Filters, ex: Existing | undefined): "added" | "updated" | "skipped" {
  const sig = sigOf(raw);
  const text = raw.descriptionHtml ? htmlToText(raw.descriptionHtml) : null;
  if (ex) {
    if (ex.sig === sig && !ex.closed_at) return "updated";
    run(
      `UPDATE jobs SET title = ?, location = ?, remote = ?, posted_at = COALESCE(?, posted_at), url = ?, apply_url = ?,
         salary = COALESCE(?, salary), department = COALESCE(?, department),
         description_html = COALESCE(?, description_html), description_text = COALESCE(?, description_text),
         listing_sig = ?, closed_at = NULL, updated_at = ? WHERE id = ?`,
      raw.title, raw.location || "", raw.remote ? 1 : 0, raw.postedAt ?? null, raw.url, raw.applyUrl ?? raw.url,
      raw.salary ?? null, raw.department ?? null, raw.descriptionHtml ?? null, text, sig, nowIso(), m.id,
    );
    return "updated";
  }
  const listing = { title: raw.title, company: m.company, location: raw.location || "", remote: raw.remote, posted_at: raw.postedAt, description_text: text };
  if (!matches(listing, f, { lenient: true }).ok) return "skipped";
  const key = dedupeKey(m.company, raw.title);
  // Remote boards and feeds often repeat a company's own posting. Two postings on one company board are two jobs.
  if (m.aggregator && get("SELECT 1 FROM jobs WHERE dedupe_key = ? AND closed_at IS NULL", key)) return "skipped";
  run(
    `INSERT INTO jobs (id, source_id, company, company_domain, title, location, remote, department, salary, url, apply_url, source,
       posted_at, description_html, description_text, details, dedupe_key, listing_sig) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.id, m.sourceId, m.company, m.domain ?? raw.companyDomain ?? null, raw.title, raw.location || "", raw.remote ? 1 : 0,
    raw.department ?? null, raw.salary ?? null, raw.url, raw.applyUrl ?? raw.url, m.source, raw.postedAt ?? null,
    raw.descriptionHtml ?? null, text, text ? "done" : m.needsDetail ? "pending" : "none", key, sig,
  );
  return "added";
}

function readOk(id: number, listings: number) {
  run("UPDATE sources SET last_read_at = ?, last_error = NULL, state = 'active', listings = ? WHERE id = ?", nowIso(), listings, id);
}
function readFailed(id: number, e: any) {
  if (isRequestLimit(e)) {
    // Ran out of requests this tick: try again soon instead of waiting a whole pass.
    run("UPDATE sources SET last_read_at = NULL WHERE id = ?", id);
    throw new OutOfRequests();
  }
  run("UPDATE sources SET last_read_at = ?, last_error = ?, state = 'error' WHERE id = ?", nowIso(), String(e?.message || e).slice(0, 300), id);
}

async function readCompany(s: SourceDb, f: Filters) {
  const adapter = ADAPTERS[s.ats ?? ""];
  if (!adapter || !s.slug) return readFailed(s.id, `Unknown job board "${s.ats}"`), 0;
  let added = 0;
  try {
    const raws = await adapter.fetchJobs({ name: s.name, ats: s.ats!, slug: s.slug, url: s.url }, { queries: workdayQueries(f) });
    const existing = existingFor(s.id);
    tx(() => {
      for (const r of raws) {
        const id = `${s.ats}:${s.slug}:${r.extId}`;
        const m: Meta = { id, sourceId: s.id, company: s.name, domain: s.domain, source: s.ats!, needsDetail: NEEDS_DETAIL.has(s.ats!), aggregator: false };
        if (store(r, m, f, existing.get(id)) === "added") added++;
      }
      // Jobs that left the board are closed, but only after a complete read: Workday is searched by keyword,
      // SmartRecruiters stops at 1,000 postings, and an empty answer is more often a glitch than a closed board.
      const complete = s.ats !== "workday" && raws.length > 0 && !(s.ats === "smartrecruiters" && raws.length >= 1000);
      if (complete) {
        const live = new Set(raws.map((r) => `${s.ats}:${s.slug}:${r.extId}`));
        const now = nowIso();
        for (const e of existing.values()) if (!e.closed_at && !live.has(e.id)) run("UPDATE jobs SET closed_at = ?, updated_at = ? WHERE id = ?", now, now, e.id);
      }
      readOk(s.id, raws.length);
    });
  } catch (e) {
    readFailed(s.id, e);
  }
  return added;
}

async function readBoardQuery(s: SourceDb, q: string, f: Filters) {
  const board = BOARDS[s.ats ?? ""];
  let added = 0;
  try {
    const raws = await board.search(q);
    const existing = existingFor(s.id);
    tx(() => {
      for (const r of raws) {
        if (!r.company?.trim()) continue;
        const id = `${board.id}:${shortId(r.extId)}`;
        const m: Meta = { id, sourceId: s.id, company: r.company.trim(), source: board.id, needsDetail: false, aggregator: true };
        if (store(r, m, f, existing.get(id)) === "added") added++;
      }
      run(
        "INSERT INTO board_queries (board, query, last_run_at) VALUES (?, ?, ?) ON CONFLICT(board, query) DO UPDATE SET last_run_at = excluded.last_run_at, last_error = NULL",
        board.id, q, nowIso(),
      );
      readOk(s.id, raws.length);
    });
  } catch (e: any) {
    if (!isRequestLimit(e)) {
      run(
        "INSERT INTO board_queries (board, query, last_run_at, last_error) VALUES (?, ?, ?, ?) ON CONFLICT(board, query) DO UPDATE SET last_run_at = excluded.last_run_at, last_error = excluded.last_error",
        board.id, q, nowIso(), String(e?.message || e).slice(0, 200),
      );
    }
    readFailed(s.id, e);
  }
  return added;
}

async function readFeedSource(s: SourceDb, f: Filters) {
  let added = 0;
  try {
    const { jobs } = await readFeed(s.url!);
    const existing = existingFor(s.id);
    tx(() => {
      for (const r of jobs) {
        const id = `feed${s.id}:${shortId(r.extId)}`;
        const m: Meta = { id, sourceId: s.id, company: (r.company || s.name).trim(), source: "feed", needsDetail: false, aggregator: true };
        if (store(r, m, f, existing.get(id)) === "added") added++;
      }
      readOk(s.id, jobs.length);
    });
  } catch (e) {
    readFailed(s.id, e);
  }
  return added;
}

/** One remote-board search that hasn't run in the last hour, if any. */
function dueBoardQuery(f: Filters) {
  const cutoff = isoAt(Date.now() - BOARD_QUERY_EVERY_MIN * 60_000);
  for (const s of all<SourceDb>("SELECT * FROM sources WHERE kind = 'board' AND state IN ('active','error') ORDER BY last_read_at IS NOT NULL, last_read_at")) {
    if (!BOARDS[s.ats ?? ""]) continue;
    for (const q of f.titles.length ? f.titles : [""]) {
      const r = get<{ last_run_at: string | null }>("SELECT last_run_at FROM board_queries WHERE board = ? AND query = ?", s.ats, q);
      if (!r?.last_run_at || r.last_run_at < cutoff) return { s, q };
    }
  }
  return null;
}

/** Descriptions (and, for Ashby and Workday, posting dates) for stored jobs whose board list left them out. */
async function fillDetails(f: Filters, limit: number) {
  if (limit <= 0) return 0;
  const rows = all<any>(
    `SELECT j.id, j.title, j.company, j.location, j.remote, j.posted_at, j.status, j.pinned, j.url, j.detail_attempts,
       s.ats, s.slug, s.url AS board_url, s.name AS source_name
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.details = 'pending' AND j.closed_at IS NULL
     ORDER BY j.detail_attempts, j.status <> 'new' DESC, j.first_seen_at DESC LIMIT 40`,
  );
  const pick: any[] = [];
  for (const j of rows) {
    const could = j.status !== "new" || matches({ ...j, remote: !!j.remote, pinned: !!j.pinned }, f, { lenient: true }).ok;
    if (!could) run("UPDATE jobs SET details = 'skipped' WHERE id = ?", j.id);
    else if (pick.length < limit) pick.push(j);
  }
  let done = 0;
  for (const j of pick) {
    try {
      const d = await ADAPTERS[j.ats].fetchDetail!(
        { name: j.source_name, ats: j.ats, slug: j.slug, url: j.board_url },
        { extId: j.id.slice(`${j.ats}:${j.slug}:`.length), title: j.title, location: j.location, remote: !!j.remote, url: j.url },
      );
      const text = d.descriptionHtml ? htmlToText(d.descriptionHtml) : null;
      run(
        `UPDATE jobs SET description_html = ?, description_text = ?, posted_at = COALESCE(?, posted_at), department = COALESCE(?, department),
           salary = COALESCE(?, salary), location = COALESCE(NULLIF(?, ''), location), details = 'done', updated_at = ? WHERE id = ?`,
        d.descriptionHtml ?? null, text, d.postedAt ?? null, d.department ?? null, d.salary ?? null, d.location ?? "", nowIso(), j.id,
      );
      done++;
    } catch (e) {
      if (isRequestLimit(e)) break;
      // A timeout or a busy server is retried on later ticks; a job that keeps failing is given up on.
      run(
        "UPDATE jobs SET detail_attempts = detail_attempts + 1, details = CASE WHEN detail_attempts + 1 >= ? THEN 'failed' ELSE 'pending' END WHERE id = ?",
        MAX_DETAIL_ATTEMPTS, j.id,
      );
    }
  }
  return done;
}

/** Hourly: drop untouched jobs that closed two weeks ago, or that a remote board listed two months ago. */
function prune() {
  const last = get<{ value: string }>("SELECT value FROM kv WHERE key = 'pruned_at'")?.value;
  if (last && Date.now() - Date.parse(last) < 3_600_000) return;
  const boards = Object.keys(BOARDS);
  const gone = all<{ id: string }>(
    `SELECT id FROM jobs WHERE ${UNTOUCHED} AND ((closed_at IS NOT NULL AND closed_at < ?) OR (source IN (${boards.map(() => "?").join(",")}) AND first_seen_at < ?))`,
    isoAt(Date.now() - 14 * 86_400_000), ...boards, isoAt(Date.now() - 60 * 86_400_000),
  );
  tx(() => {
    for (const j of gone) {
      run("DELETE FROM events WHERE job_id = ?", j.id);
      run("DELETE FROM jobs WHERE id = ?", j.id);
    }
    run("INSERT INTO kv (key, value) VALUES ('pruned_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", nowIso());
  });
}

// The website reloads whatever changed. Collector news is batched so an open tab doesn't re-read the
// whole job list every 15 seconds (database reads count against the free plan's daily allowance).
const pending = new Set<Topic>();
let lastRefresh = 0;
function refreshUi(...topics: Topic[]) {
  for (const t of topics) pending.add(t);
  if (pending.size && Date.now() - lastRefresh >= UI_REFRESH_MS) {
    for (const t of pending) broadcast(t);
    pending.clear();
    lastRefresh = Date.now();
  }
}

export async function tick() {
  const f = getSettings().filters;
  let left = BUDGET;
  let added = 0;
  let readSomething = false;
  try {
    const queued = get<SourceDb>("SELECT * FROM sources WHERE state = 'queued' ORDER BY id LIMIT 1");
    if (queued) {
      left -= queued.url ? 2 : 30;
      await resolveQueued(queued);
    }

    const due = dueCompanies();
    let read = 0;
    while (due.length && read < MAX_COMPANIES) {
      const s = get<SourceDb>("SELECT * FROM sources WHERE id = ?", due[0]);
      if (!s || s.state === "paused" || s.state === "queued") {
        due.shift();
        continue;
      }
      const cost = companyCost(s, f);
      if (cost > left) break;
      due.shift();
      left -= cost;
      read++;
      // Claim it first: a run cut short sends the board to the back of the line instead of blocking it.
      run("UPDATE sources SET last_read_at = ? WHERE id = ?", nowIso(), s.id);
      added += await readCompany(s, f);
      readSomething = true;
    }

    const feed = get<SourceDb>(
      "SELECT * FROM sources WHERE kind = 'feed' AND state IN ('active','error') AND (last_read_at IS NULL OR last_read_at < ?) ORDER BY last_read_at IS NOT NULL, last_read_at LIMIT 1",
      isoAt(Date.now() - BOARD_QUERY_EVERY_MIN * 60_000),
    );
    if (feed && left >= 1) {
      left -= 1;
      added += await readFeedSource(feed, f);
      readSomething = true;
    } else if (!feed) {
      const bq = dueBoardQuery(f);
      const cost = bq ? (BOARD_COST[bq.s.ats ?? ""] ?? 3) : 0;
      if (bq && cost <= left) {
        left -= cost;
        added += await readBoardQuery(bq.s, bq.q, f);
        readSomething = true;
      }
    }

    const filled = await fillDetails(f, Math.min(DETAILS_PER_TICK, left));
    if (added || filled) refreshUi("jobs");
  } catch (e) {
    if (!(e instanceof OutOfRequests)) throw e;
  } finally {
    prune();
    if (readSomething) refreshUi("sources");
    else refreshUi();
  }
}
