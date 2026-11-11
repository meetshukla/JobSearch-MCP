/**
 * Sources: company job boards, remote job boards and RSS feeds.
 * Adding is instant for anything Hunt can recognise offline (a board URL, "greenhouse:stripe", a board id).
 * Company names and other URLs are queued, and the collector works out their board one per run.
 */
import { all, get, run, tx, parseJson } from "../db.ts";
import { ADAPTERS, parseAtsUrl, detectAts } from "../sources/ats.ts";
import { BOARDS } from "../sources/boards.ts";
import { fetchText, looksLikeFeed, parseFeed } from "../sources/feeds.ts";
import { getSettings } from "../settings.ts";
import { matches } from "../filters.ts";
import { broadcast } from "./events.ts";
import { nowIso } from "../schema.ts";
import { UNTOUCHED, sourcesChanged } from "./keep.ts";
import { LISTS } from "./lists.ts";
import type { AddSourceResult, ListSourcesResult, SourceKind, SourceRow, SourceState } from "../../shared/types.ts";

export type SourceDb = {
  id: number;
  key: string;
  kind: SourceKind;
  name: string;
  ats: string | null;
  slug: string | null;
  url: string | null;
  domain: string | null;
  tags: string | null;
  state: SourceState;
  last_read_at: string | null;
  last_error: string | null;
  listings: number;
};

const ATS_IDS = Object.keys(ADAPTERS);
const prettySlug = (slug: string) => slug.split("/")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
export const companyKey = (ats: string, slug: string) => `company:${ats}:${slug.toLowerCase()}`;

export function boardUrl(s: Pick<SourceDb, "kind" | "ats" | "slug" | "url">) {
  if (s.kind === "company" && s.ats && s.slug && ADAPTERS[s.ats]) return ADAPTERS[s.ats].boardUrl(s.slug, s.url);
  if (s.kind === "board" && s.ats) return BOARD_HOME[s.ats] ?? null;
  return s.url;
}

const BOARD_HOME: Record<string, string> = {
  remotive: "https://remotive.com",
  himalayas: "https://himalayas.app",
  jobicy: "https://jobicy.com",
  weworkremotely: "https://weworkremotely.com",
  arbeitnow: "https://www.arbeitnow.com",
};

function insert(s: { key: string; kind: SourceKind; name: string; ats?: string | null; slug?: string | null; url?: string | null; tags?: string[]; state: SourceState }) {
  const ex = get<{ id: number; state: SourceState }>("SELECT id, state FROM sources WHERE key = ?", s.key);
  if (ex) {
    // Adding it again brings back a paused source, and retries one that failed to resolve.
    const pending = s.key.startsWith("pending:");
    if (ex.state === "paused" || (pending && ex.state === "error")) {
      run("UPDATE sources SET state = ?, last_error = NULL, last_read_at = NULL WHERE id = ?", pending ? "queued" : "active", ex.id);
    }
    return { id: ex.id, existed: true };
  }
  const id = Number(
    run(
      "INSERT INTO sources (key, kind, name, ats, slug, url, tags, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      s.key, s.kind, s.name, s.ats ?? null, s.slug ?? null, s.url ?? null, s.tags?.length ? JSON.stringify(s.tags) : null, s.state,
    ).lastInsertRowid,
  );
  return { id, existed: false };
}

/** Built-in remote job boards, added once on a new install. Remove or pause any of them. */
export function seedDefaults() {
  if (get("SELECT 1 FROM kv WHERE key = 'seeded'")) return;
  for (const b of Object.values(BOARDS)) insert({ key: `board:${b.id}`, kind: "board", name: b.label, ats: b.id, state: "active" });
  run("INSERT INTO kv (key, value) VALUES ('seeded', '1')");
}

export function addSources(input: { items?: string[]; list?: string }): AddSourceResult[] {
  const results: AddSourceResult[] = [];
  tx(() => {
    if (input.list) {
      const list = LISTS[input.list];
      if (!list) {
        results.push({ input: `list:${input.list}`, status: "error", message: `No list called "${input.list}". Lists: ${Object.keys(LISTS).join(", ")}.` });
      } else {
        let added = 0;
        for (const c of list.companies) {
          if (!ADAPTERS[c.ats]) continue;
          const r = insert({ key: companyKey(c.ats, c.slug), kind: "company", name: c.name, ats: c.ats, slug: c.slug, url: c.url, tags: c.tags, state: "active" });
          if (!r.existed) added++;
        }
        const had = list.companies.length - added;
        results.push({ input: `list:${input.list}`, status: "added", message: `Added ${added} companies from ${list.label}.${had ? ` ${had} ${had === 1 ? "was" : "were"} already there.` : ""}` });
      }
    }
    for (const raw of input.items ?? []) results.push(addOne(raw));
  });
  sourcesChanged();
  broadcast("sources");
  return results;
}

function addOne(raw: string): AddSourceResult {
  const t = raw.trim();
  if (!t) return { input: raw, status: "error", message: "Empty." };
  const board = BOARDS[t.toLowerCase()];
  if (board) {
    const r = insert({ key: `board:${board.id}`, kind: "board", name: board.label, ats: board.id, state: "active" });
    return done(t, r, { kind: "board", name: board.label, system: board.id });
  }
  const pair = t.match(/^([a-z]+):([\w.-]+)$/i);
  if (pair && ATS_IDS.includes(pair[1].toLowerCase()) && pair[1].toLowerCase() !== "workday") {
    const ats = pair[1].toLowerCase();
    const r = insert({ key: companyKey(ats, pair[2]), kind: "company", name: prettySlug(pair[2]), ats, slug: pair[2], state: "active" });
    return done(t, r, { kind: "company", name: prettySlug(pair[2]), system: ats });
  }
  if (/^https?:\/\//i.test(t)) {
    const p = parseAtsUrl(t);
    if (p) {
      const r = insert({ key: companyKey(p.ats, p.slug), kind: "company", name: prettySlug(p.slug), ats: p.ats, slug: p.slug, url: p.url ?? null, state: "active" });
      const res = done(t, r, { kind: "company", name: prettySlug(p.slug), system: p.ats });
      if (p.jobId) res.message += " That was one job's link, so the company's whole board was added. To track just that job, use add_job.";
      return res;
    }
    let host = t;
    try {
      host = new URL(t).hostname.replace(/^www\./, "");
    } catch {
      return { input: t, status: "error", message: "That isn't a valid URL." };
    }
    const r = insert({ key: `pending:${t}`, kind: "company", name: host, url: t, state: "queued" });
    return { input: t, status: r.existed ? "exists" : "queued", message: r.existed ? "Already added." : "Queued. Hunt will check whether it's an RSS feed or a careers page with a job board.", source: { id: r.id, name: host, kind: "company", system: null } };
  }
  const r = insert({ key: `pending:${t.toLowerCase()}`, kind: "company", name: t, state: "queued" });
  return { input: t, status: r.existed ? "exists" : "queued", message: r.existed ? "Already added." : "Queued. Hunt will look for its public job board within a few minutes.", source: { id: r.id, name: t, kind: "company", system: null } };
}

function done(input: string, r: { id: number; existed: boolean }, s: { kind: SourceKind; name: string; system: string | null }): AddSourceResult {
  return { input, status: r.existed ? "exists" : "added", message: r.existed ? "Already added." : "Added. Hunt reads it within the hour.", source: { id: r.id, ...s } };
}

/** Find the job board behind a queued company name or URL. Called by the collector, one per run. */
export async function resolveQueued(s: SourceDb) {
  const settle = (patch: { key: string; kind: SourceKind; name: string; ats?: string | null; slug?: string | null; url?: string | null }) => {
    const clash = get<{ id: number }>("SELECT id FROM sources WHERE key = ? AND id <> ?", patch.key, s.id);
    if (clash) {
      run("DELETE FROM sources WHERE id = ?", s.id);
      return;
    }
    run(
      "UPDATE sources SET key = ?, kind = ?, name = ?, ats = ?, slug = ?, url = ?, state = 'active', last_error = NULL, last_read_at = NULL WHERE id = ?",
      patch.key, patch.kind, patch.name, patch.ats ?? null, patch.slug ?? null, patch.url ?? null, s.id,
    );
  };
  const failWith = (msg: string) => run("UPDATE sources SET state = 'error', last_error = ?, last_read_at = ? WHERE id = ?", msg, nowIso(), s.id);
  try {
    if (s.url) {
      const body = await fetchText(s.url);
      if (looksLikeFeed(body)) {
        const feed = parseFeed(body, s.url);
        return settle({ key: `feed:${s.url}`, kind: "feed", name: feed.title || s.name, url: s.url });
      }
      const hit = findBoardLink(body);
      if (hit) return settle({ key: companyKey(hit.ats, hit.slug), kind: "company", name: s.name.replace(/^(careers|jobs)\./, ""), ats: hit.ats, slug: hit.slug, url: hit.url ?? null });
      return failWith("No job board found on that page. Hunt reads Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee and Workday boards, and RSS or Atom feeds.");
    }
    const hits = await detectAts(s.name);
    if (!hits.length) return failWith(`Couldn't find a public job board for ${s.name}. Add its careers page URL instead.`);
    settle({ key: companyKey(hits[0].ats, hits[0].slug), kind: "company", name: s.name, ats: hits[0].ats, slug: hits[0].slug });
  } catch (e: any) {
    failWith(String(e?.message || e).slice(0, 300));
  } finally {
    sourcesChanged();
    broadcast("sources");
  }
}

const BOARD_LINK = /https?:\/\/[a-z0-9.-]*(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|recruitee\.com|smartrecruiters\.com|myworkdayjobs\.com)[^"'\s<>)\\]*/gi;
const NOT_SLUGS = new Set(["embed", "v1", "api", "static", "assets", "js", "css", "favicon.ico", "j"]);

export function findBoardLink(html: string) {
  for (const m of html.matchAll(BOARD_LINK)) {
    const p = parseAtsUrl(m[0].replace(/&amp;/g, "&"));
    if (p && p.slug && !NOT_SLUGS.has(p.slug.toLowerCase())) return p;
  }
  return null;
}

/** Open jobs per source that pass the filters (descriptions aside, to keep it light). */
function matchingBySource() {
  const f = getSettings().filters;
  const counts = new Map<number, number>();
  for (const j of all<any>("SELECT source_id, title, company, location, remote, posted_at, pinned FROM jobs WHERE closed_at IS NULL AND status = 'new' AND source_id IS NOT NULL")) {
    if (matches({ ...j, remote: !!j.remote, pinned: !!j.pinned }, f).ok) counts.set(j.source_id, (counts.get(j.source_id) ?? 0) + 1);
  }
  return counts;
}

export function toSourceRow(s: SourceDb, matching = 0): SourceRow {
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    system: s.ats,
    url: boardUrl(s),
    tags: parseJson<string[]>(s.tags, []),
    state: s.state,
    last_read_at: s.last_read_at,
    last_error: s.last_error,
    listings: s.listings,
    matching,
  };
}

export function listSources(q: { state?: SourceState; kind?: SourceKind; query?: string; limit?: number; offset?: number } = {}): ListSourcesResult {
  const where: string[] = [];
  const params: any[] = [];
  if (q.state) where.push("state = ?"), params.push(q.state);
  if (q.kind) where.push("kind = ?"), params.push(q.kind);
  if (q.query) where.push("(name LIKE ? OR slug LIKE ? OR tags LIKE ?)"), params.push(...Array(3).fill(`%${q.query}%`));
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const counts = { queued: 0, active: 0, paused: 0, error: 0 } as Record<SourceState, number>;
  for (const r of all<{ state: SourceState; n: number }>("SELECT state, COUNT(*) n FROM sources GROUP BY state")) counts[r.state] = r.n;
  const total = get<{ n: number }>(`SELECT COUNT(*) n FROM sources ${w}`, ...params)!.n;
  const matching = matchingBySource();
  const rows = all<SourceDb>(`SELECT * FROM sources ${w}`, ...params)
    .map((s) => toSourceRow(s, matching.get(s.id) ?? 0))
    .sort((a, b) => b.matching - a.matching || stateRank(a.state) - stateRank(b.state) || a.name.localeCompare(b.name));
  const offset = q.offset ?? 0;
  return { total, counts, sources: rows.slice(offset, offset + Math.min(Math.max(q.limit ?? 50, 1), 500)) };
}

const stateRank = (s: SourceState) => ({ error: 0, queued: 1, active: 2, paused: 3 })[s];

export function updateSources(ids: number[], action: "pause" | "resume" | "remove" | "read_now") {
  let changed = 0;
  tx(() => {
    for (const id of ids) {
      const s = get<SourceDb>("SELECT * FROM sources WHERE id = ?", id);
      if (!s) continue;
      changed++;
      // A remote board is searched per title; its searches have their own clocks.
      if ((action === "resume" || action === "read_now") && s.kind === "board") run("DELETE FROM board_queries WHERE board = ?", s.ats);
      if (action === "pause") run("UPDATE sources SET state = 'paused' WHERE id = ?", id);
      if (action === "resume") run("UPDATE sources SET state = ?, last_read_at = NULL WHERE id = ?", s.key.startsWith("pending:") ? "queued" : "active", id);
      if (action === "read_now") run("UPDATE sources SET last_read_at = NULL, state = CASE WHEN state = 'error' AND key NOT LIKE 'pending:%' THEN 'active' WHEN state = 'error' THEN 'queued' ELSE state END WHERE id = ?", id);
      if (action === "remove") {
        // Jobs you or your agent acted on stay; untouched ones go with the source.
        for (const j of all<{ id: string }>(`SELECT id FROM jobs WHERE source_id = ? AND ${UNTOUCHED}`, id)) {
          run("DELETE FROM events WHERE job_id = ?", j.id);
          run("DELETE FROM jobs WHERE id = ?", j.id);
        }
        run("UPDATE jobs SET source_id = NULL WHERE source_id = ?", id);
        run("DELETE FROM sources WHERE id = ?", id);
      }
    }
  });
  sourcesChanged();
  broadcast("sources");
  if (action === "remove") broadcast("jobs");
  return { changed };
}

/** Read every source again soon (after the filters change, so newly matching jobs come in). */
export function markAllDue() {
  run("UPDATE sources SET last_read_at = NULL WHERE state IN ('active', 'error') AND key NOT LIKE 'pending:%'");
  run("DELETE FROM board_queries");
  sourcesChanged();
}
