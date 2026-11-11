/**
 * Track one job from a link. Known job boards are read through their API; any other page is read from
 * its schema.org JobPosting data. A job added this way always shows, whatever the filters say.
 */
import { get, run } from "../db.ts";
import { ADAPTERS, parseAtsUrl, slugCandidates, type RawJob } from "../sources/ats.ts";
import { fetchJson, UA } from "../sources/http.ts";
import { nowIso } from "../schema.ts";
import { htmlToText, decodeEntities } from "./html.ts";
import { dedupeKey } from "./collect.ts";
import { companyKey } from "./sources.ts";
import { addEvent, broadcast } from "./events.ts";

type Found = { id: string; raw: RawJob; company: string; sourceId: number | null; source: string };

const prettySlug = (slug: string) => slug.split("/")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

async function fromBoard(url: string): Promise<Found | null> {
  const p = parseAtsUrl(url);
  if (!p?.jobId) return null;
  const src = get<{ id: number; name: string; url: string | null }>("SELECT id, name, url FROM sources WHERE key = ?", companyKey(p.ats, p.slug));
  const ref = { name: src?.name ?? prettySlug(p.slug), ats: p.ats, slug: p.slug, url: p.url ?? src?.url ?? null };
  let raw: RawJob | undefined;
  if (p.ats === "greenhouse") {
    const j = await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${p.slug}/jobs/${p.jobId}`);
    const loc = j.location?.name || "";
    raw = { extId: String(j.id), title: j.title, location: loc, remote: /remote/i.test(loc), url: j.absolute_url, applyUrl: j.absolute_url, descriptionHtml: j.content, postedAt: j.first_published || undefined };
  } else if (p.ats === "workday") {
    raw = { extId: p.jobId, title: "Job", location: "", remote: false, url, applyUrl: `${url.replace(/\/$/, "")}/apply` };
    Object.assign(raw, await ADAPTERS.workday.fetchDetail!(ref, raw));
  } else {
    const list = await ADAPTERS[p.ats].fetchJobs(ref, { queries: [] });
    raw = list.find((r) => r.extId === p.jobId || r.url?.includes(p.jobId!) || r.applyUrl?.includes(p.jobId!));
    if (raw && !raw.descriptionHtml && ADAPTERS[p.ats].fetchDetail) Object.assign(raw, await ADAPTERS[p.ats].fetchDetail!(ref, raw));
  }
  if (!raw) throw new Error("That job isn't on the board any more.");
  return { id: `${p.ats}:${p.slug}:${raw.extId}`, raw, company: ref.name, sourceId: src?.id ?? null, source: p.ats };
}

/** Company sites that embed Greenhouse (example.com/careers?gh_jid=123). */
async function fromGhJid(url: string): Promise<Found | null> {
  const u = new URL(url);
  const jid = u.searchParams.get("gh_jid");
  if (!jid) return null;
  const label = u.hostname.replace(/^(www|careers|jobs)\./, "").split(".")[0];
  for (const slug of slugCandidates(label)) {
    try {
      await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jid}`);
      return fromBoard(`https://job-boards.greenhouse.io/${slug}/jobs/${jid}`);
    } catch {
      /* try the next slug */
    }
  }
  return null;
}

function findJobPosting(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const t = node["@type"];
  if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return node;
  return node["@graph"] ? findJobPosting(node["@graph"]) : null;
}

/** The link without its fragment and tracking parameters; other parameters often identify the job. */
function canonicalLink(url: string) {
  const u = new URL(url);
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$|src$|gh_src$|lever-source|trk)/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

async function fromPage(url: string): Promise<Found> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't open that page (HTTP ${res.status}).`);
  const html = await res.text();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let jp: any;
    try {
      jp = findJobPosting(JSON.parse(m[1].trim()));
    } catch {
      continue;
    }
    if (!jp) continue;
    const loc = [jp.jobLocation]
      .flat()
      .filter(Boolean)
      .map((l: any) => [l.address?.addressLocality, l.address?.addressRegion, l.address?.addressCountry?.name || l.address?.addressCountry].filter(Boolean).join(", "))
      .join(" / ");
    const remote = jp.jobLocationType === "TELECOMMUTE";
    return {
      id: `link:${canonicalLink(url)}`,
      company: decodeEntities(jp.hiringOrganization?.name || new URL(url).hostname),
      sourceId: null,
      source: "link",
      raw: {
        extId: url,
        title: decodeEntities(jp.title || "Job"),
        location: loc || (remote ? "Remote" : ""),
        remote,
        url,
        applyUrl: jp.url || url,
        descriptionHtml: decodeEntities(jp.description || ""),
        postedAt: jp.datePosted,
      },
    };
  }
  throw new Error("That page has no structured job data (schema.org JobPosting). Open the job on its job board (Greenhouse, Lever, Ashby, ...) and add that link.");
}

export async function addJob(url: string, by: "you" | "agent", note?: string) {
  if (!/^https?:\/\//i.test(url.trim())) throw new Error("Give the job's full link, starting with https://.");
  const link = url.trim();
  const found =
    (await fromBoard(link).catch((e) => {
      if (parseAtsUrl(link)?.jobId) throw e;
      return null;
    })) ??
    (await fromGhJid(link).catch(() => null)) ??
    (await fromPage(link));
  const r = found.raw;
  const now = nowIso();
  if (get("SELECT 1 FROM jobs WHERE id = ?", found.id)) {
    run("UPDATE jobs SET pinned = 1, closed_at = NULL, updated_at = ? WHERE id = ?", now, found.id);
  } else {
    const text = r.descriptionHtml ? htmlToText(r.descriptionHtml) : null;
    run(
      `INSERT INTO jobs (id, source_id, company, title, location, remote, department, salary, url, apply_url, source, posted_at,
         description_html, description_text, details, dedupe_key, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      found.id, found.sourceId, found.company, r.title, r.location || "", r.remote ? 1 : 0, r.department ?? null, r.salary ?? null,
      r.url, r.applyUrl ?? r.url, found.source, r.postedAt ?? null, r.descriptionHtml ?? null, text, text ? "done" : "none",
      dedupeKey(found.company, r.title),
    );
    addEvent(found.id, "added", `${by === "you" ? "You" : "Your agent"} added it from a link`, by);
  }
  if (note?.trim()) addEvent(found.id, "note", note.trim(), by);
  broadcast("jobs");
  return found.id;
}
