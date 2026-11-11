/**
 * The collector. Cloudflare's free plan allows 50 outside requests per run, so instead of one big scan
 * the Durable Object's alarm runs a small tick every 15 seconds:
 *   1. work out the board behind one queued company name or URL (if any)
 *   2. read the company boards that are due, oldest first (every board about once an hour)
 *   3. one remote-board search or RSS feed that is due
 *   4. fetch descriptions for jobs whose board list doesn't include them
 * Only listings that could pass your filters are stored. Changing the filters reads every source again.
 */
import { all, get, run, tx } from "../db.ts";
import { ADAPTERS, type RawJob } from "../sources/ats.ts";
import { BOARDS } from "../sources/boards.ts";
import { readFeed } from "../sources/feeds.ts";
import { getSettings } from "../settings.ts";
import { matches } from "../filters.ts";
import { isoAt, nowIso } from "../schema.ts";
import { htmlToText, slugify } from "./html.ts";
import { broadcast } from "./events.ts";
import { resolveQueued, type SourceDb } from "./sources.ts";
import type { Filters } from "../../shared/types.ts";

export const TICK_MS = 15_000;
const COMPANIES_PER_TICK = 4;
const DETAILS_PER_TICK = 6;
const BOARD_QUERY_EVERY_MIN = 60;
/** Board systems whose job list has no descriptions: those come from one extra request per job. */
const NEEDS_DETAIL = new Set(["greenhouse", "ashby", "smartrecruiters", "workday"]);

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

/** Minutes for one pass over every active company board at the free plan's pace, never under an hour. */
export function passMinutes() {
  const n = get<{ n: number }>("SELECT COUNT(*) n FROM sources WHERE kind = 'company' AND state IN ('active','error') AND key NOT LIKE 'pending:%'")!.n;
  return Math.max(60, Math.ceil(n / (COMPANIES_PER_TICK * (60_000 / TICK_MS))) + 5);
}

/** Search words for boards that search by keyword (Workday, the remote boards). */
const searchTerms = (f: Filters) => (f.titles.length ? f.titles : [""]);

type Meta = { id: string; sourceId: number; company: string; domain?: string | null; source: string; needsDetail: boolean };

/** Store a listing that could pass the filters, or refresh one already stored. */
function store(raw: RawJob, m: Meta, f: Filters): "added" | "updated" | "skipped" {
  const ex = get<any>("SELECT title, location, posted_at, closed_at FROM jobs WHERE id = ?", m.id);
  if (ex) {
    const posted = raw.postedAt ?? ex.posted_at;
    if (ex.closed_at || ex.title !== raw.title || ex.location !== (raw.location || "") || posted !== ex.posted_at) {
      run(
        "UPDATE jobs SET title = ?, location = ?, remote = ?, posted_at = ?, closed_at = NULL, updated_at = ? WHERE id = ?",
        raw.title, raw.location || "", raw.remote ? 1 : 0, posted ?? null, nowIso(), m.id,
      );
    }
    return "updated";
  }
  const text = raw.descriptionHtml ? htmlToText(raw.descriptionHtml) : null;
  const listing = { title: raw.title, company: m.company, location: raw.location || "", remote: raw.remote, posted_at: raw.postedAt, description_text: text };
  if (!matches(listing, f, { lenient: true }).ok) return "skipped";
  const key = dedupeKey(m.company, raw.title);
  if (get("SELECT 1 FROM jobs WHERE dedupe_key = ? AND closed_at IS NULL", key)) return "skipped";
  run(
    `INSERT INTO jobs (id, source_id, company, company_domain, title, location, remote, department, salary, url, apply_url, source,
       posted_at, description_html, description_text, details, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.id, m.sourceId, m.company, m.domain ?? raw.companyDomain ?? null, raw.title, raw.location || "", raw.remote ? 1 : 0,
    raw.department ?? null, raw.salary ?? null, raw.url, raw.applyUrl ?? raw.url, m.source, raw.postedAt ?? null,
    raw.descriptionHtml ?? null, text, text ? "done" : m.needsDetail ? "pending" : "none", key,
  );
  return "added";
}

function readOk(id: number, listings: number) {
  run("UPDATE sources SET last_read_at = ?, last_error = NULL, state = 'active', listings = ? WHERE id = ?", nowIso(), listings, id);
}
function readFailed(id: number, e: any) {
  run("UPDATE sources SET last_read_at = ?, last_error = ?, state = 'error' WHERE id = ?", nowIso(), String(e?.message || e).slice(0, 300), id);
}

async function readCompany(s: SourceDb, f: Filters) {
  const adapter = ADAPTERS[s.ats ?? ""];
  if (!adapter || !s.slug) return readFailed(s.id, `Unknown job board "${s.ats}"`), 0;
  let added = 0;
  try {
    const raws = await adapter.fetchJobs({ name: s.name, ats: s.ats!, slug: s.slug, url: s.url }, { queries: searchTerms(f).slice(0, 3) });
    tx(() => {
      for (const r of raws) {
        const m: Meta = { id: `${s.ats}:${s.slug}:${r.extId}`, sourceId: s.id, company: s.name, domain: s.domain, source: s.ats!, needsDetail: NEEDS_DETAIL.has(s.ats!) };
        if (store(r, m, f) === "added") added++;
      }
      // Jobs that left the board are closed. Workday is searched by keyword, so a missing job may just not match.
      if (s.ats !== "workday") {
        const live = new Set(raws.map((r) => `${s.ats}:${s.slug}:${r.extId}`));
        for (const j of all<{ id: string }>("SELECT id FROM jobs WHERE source_id = ? AND closed_at IS NULL", s.id)) {
          if (!live.has(j.id)) run("UPDATE jobs SET closed_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), j.id);
        }
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
    tx(() => {
      for (const r of raws) {
        if (!r.company?.trim()) continue;
        const m: Meta = { id: `${board.id}:${shortId(r.extId)}`, sourceId: s.id, company: r.company.trim(), source: board.id, needsDetail: false };
        if (store(r, m, f) === "added") added++;
      }
      run(
        "INSERT INTO board_queries (board, query, last_run_at) VALUES (?, ?, ?) ON CONFLICT(board, query) DO UPDATE SET last_run_at = excluded.last_run_at, last_error = NULL",
        board.id, q, nowIso(),
      );
      readOk(s.id, raws.length);
    });
  } catch (e: any) {
    run(
      "INSERT INTO board_queries (board, query, last_run_at, last_error) VALUES (?, ?, ?, ?) ON CONFLICT(board, query) DO UPDATE SET last_run_at = excluded.last_run_at, last_error = excluded.last_error",
      board.id, q, nowIso(), String(e?.message || e).slice(0, 200),
    );
    readFailed(s.id, e);
  }
  return added;
}

async function readFeedSource(s: SourceDb, f: Filters) {
  let added = 0;
  try {
    const { jobs } = await readFeed(s.url!);
    tx(() => {
      for (const r of jobs) {
        const m: Meta = { id: `feed${s.id}:${shortId(r.extId)}`, sourceId: s.id, company: (r.company || s.name).trim(), source: "feed", needsDetail: false };
        if (store(r, m, f) === "added") added++;
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
    for (const q of searchTerms(f)) {
      const r = get<{ last_run_at: string | null }>("SELECT last_run_at FROM board_queries WHERE board = ? AND query = ?", s.ats, q);
      if (!r?.last_run_at || r.last_run_at < cutoff) return { s, q };
    }
  }
  return null;
}

/** Descriptions (and, for Ashby and Workday, posting dates) for stored jobs whose board list left them out. */
async function fillDetails(f: Filters, limit: number) {
  const rows = all<any>(
    `SELECT j.id, j.title, j.company, j.location, j.remote, j.posted_at, j.status, j.pinned, j.url,
       s.ats, s.slug, s.url AS board_url, s.name AS source_name
     FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.details = 'pending' AND j.closed_at IS NULL
     ORDER BY j.status <> 'new' DESC, j.first_seen_at DESC LIMIT 40`,
  );
  const pick: any[] = [];
  for (const j of rows) {
    const could = j.status !== "new" || matches({ ...j, remote: !!j.remote, pinned: !!j.pinned }, f, { lenient: true }).ok;
    if (!could) run("UPDATE jobs SET details = 'skipped' WHERE id = ?", j.id);
    else if (pick.length < limit) pick.push(j);
  }
  for (const j of pick) {
    const adapter = ADAPTERS[j.ats];
    try {
      const d = await adapter.fetchDetail!(
        { name: j.source_name, ats: j.ats, slug: j.slug, url: j.board_url },
        { extId: j.id.slice(`${j.ats}:${j.slug}:`.length), title: j.title, location: j.location, remote: !!j.remote, url: j.url },
      );
      const text = d.descriptionHtml ? htmlToText(d.descriptionHtml) : null;
      run(
        `UPDATE jobs SET description_html = ?, description_text = ?, posted_at = COALESCE(?, posted_at), department = COALESCE(?, department),
           salary = COALESCE(?, salary), location = COALESCE(NULLIF(?, ''), location), details = 'done', updated_at = ? WHERE id = ?`,
        d.descriptionHtml ?? null, text, d.postedAt ?? null, d.department ?? null, d.salary ?? null, d.location ?? "", nowIso(), j.id,
      );
    } catch {
      run("UPDATE jobs SET details = 'failed' WHERE id = ?", j.id);
    }
  }
  return pick.length;
}

/** Hourly: drop untouched jobs that closed two weeks ago, or that a remote board listed two months ago. */
function prune() {
  const last = get<{ value: string }>("SELECT value FROM kv WHERE key = 'pruned_at'")?.value;
  if (last && Date.now() - Date.parse(last) < 3_600_000) return;
  const untouched = "status = 'new' AND verdict_score IS NULL AND pinned = 0";
  const gone = all<{ id: string }>(
    `SELECT id FROM jobs WHERE ${untouched} AND ((closed_at IS NOT NULL AND closed_at < ?) OR (source IN (${Object.keys(BOARDS).map(() => "?").join(",")}) AND first_seen_at < ?))`,
    isoAt(Date.now() - 14 * 86_400_000), ...Object.keys(BOARDS), isoAt(Date.now() - 60 * 86_400_000),
  );
  tx(() => {
    for (const j of gone) {
      run("DELETE FROM events WHERE job_id = ?", j.id);
      run("DELETE FROM jobs WHERE id = ?", j.id);
    }
    run("INSERT INTO kv (key, value) VALUES ('pruned_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", nowIso());
  });
}

export async function tick() {
  const f = getSettings().filters;
  let added = 0;

  const queued = get<SourceDb>("SELECT * FROM sources WHERE state = 'queued' ORDER BY id LIMIT 1");
  if (queued) await resolveQueued(queued);

  const due = all<SourceDb>(
    `SELECT * FROM sources WHERE kind = 'company' AND state IN ('active','error') AND key NOT LIKE 'pending:%'
       AND (last_read_at IS NULL OR last_read_at < ?) ORDER BY last_read_at IS NOT NULL, last_read_at LIMIT ?`,
    isoAt(Date.now() - passMinutes() * 60_000),
    queued ? 1 : COMPANIES_PER_TICK,
  );
  for (const s of due) {
    // Claim it first: a run cut short sends the board to the back of the line instead of blocking it.
    run("UPDATE sources SET last_read_at = ? WHERE id = ?", nowIso(), s.id);
    added += await readCompany(s, f);
  }

  if (!queued) {
    const feed = get<SourceDb>(
      "SELECT * FROM sources WHERE kind = 'feed' AND state IN ('active','error') AND (last_read_at IS NULL OR last_read_at < ?) ORDER BY last_read_at IS NOT NULL, last_read_at LIMIT 1",
      isoAt(Date.now() - BOARD_QUERY_EVERY_MIN * 60_000),
    );
    const bq = feed ? null : dueBoardQuery(f);
    if (feed) added += await readFeedSource(feed, f);
    else if (bq) added += await readBoardQuery(bq.s, bq.q, f);
  }

  const filled = await fillDetails(f, DETAILS_PER_TICK);
  prune();
  if (added || filled) broadcast("jobs");
  if (due.length || queued) broadcast("sources");
}
