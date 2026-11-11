/**
 * Any job board that publishes an RSS or Atom feed (We Work Remotely, Remote OK, Working Nomads, a company's own feed…).
 * Agents add them with add_job_board. Items are read with simple rules:
 *   company: <company>/<job:company>/<author>, or "Company: Title" / "Title at Company" in the item title
 *   location: <location>/<region>/<job:location>, or "Remote" when the feed is marked remote.
 */
import { UA } from "./http.ts";
import { decodeEntities } from "../lib/html.ts";
import type { RawJob } from "./ats.ts";

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();

function tag(xml: string, names: string[]): string {
  for (const n of names) {
    const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return cdata(m[1]);
  }
  return "";
}

function atomLink(xml: string) {
  const alt = xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || xml.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? decodeEntities(alt[1]) : "";
}

const iso = (v: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

function splitCompany(title: string): { company?: string; title: string } {
  const colon = title.indexOf(": ");
  if (colon > 0 && colon < 60) return { company: title.slice(0, colon).trim(), title: title.slice(colon + 2).trim() };
  const at = title.match(/^(.*?)\s+(?:at|@)\s+([^|–-]{2,60})(?:\s*[|–-].*)?$/i);
  if (at) return { company: at[2].trim(), title: at[1].trim() };
  return { title };
}

export type FeedRead = { title: string; jobs: RawJob[] };

/** Fetch a URL as text. Feeds and careers pages both come through here. */
export async function fetchText(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export const looksLikeFeed = (xml: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 2000));

export async function readFeed(url: string, opts: { remote?: boolean } = {}): Promise<FeedRead> {
  return parseFeed(await fetchText(url), url, opts);
}

/** Feeds from remote-job sites mark every item remote even when the item only names a region ("EMEA Only"). */
export function parseFeed(xml: string, url: string, opts: { remote?: boolean } = {}): FeedRead {
  if (!looksLikeFeed(xml)) throw new Error("That URL is not an RSS or Atom feed.");
  const head = xml.split(/<item[\s>]|<entry[\s>]/i)[0];
  const feedTitle = decodeEntities(tag(head, ["title"])) || new URL(url).hostname;
  opts = { remote: opts.remote ?? /remote/i.test(`${url} ${feedTitle}`) };
  const blocks = xml.split(/<item[\s>]/i).length > 1 ? xml.split(/<item[\s>]/i).slice(1) : xml.split(/<entry[\s>]/i).slice(1);
  const jobs: RawJob[] = [];
  for (const raw of blocks.slice(0, 500)) {
    const item = raw.split(/<\/item>|<\/entry>/i)[0];
    const fullTitle = decodeEntities(tag(item, ["title"])).replace(/\s+/g, " ").trim();
    const link = decodeEntities(tag(item, ["link"])) || atomLink(item) || decodeEntities(tag(item, ["guid", "id"]));
    if (!fullTitle || !/^https?:\/\//.test(link)) continue;
    const split = splitCompany(fullTitle);
    const company = decodeEntities(tag(item, ["company", "job:company", "job_listing:company", "dc:creator", "name", "author"])).replace(/<[^>]+>/g, "").trim() || split.company;
    const where = decodeEntities(tag(item, ["location", "job:location", "region", "job_listing:location"]));
    const remote = Boolean(opts.remote) || /remote|anywhere|worldwide/i.test(where);
    jobs.push({
      extId: link,
      title: company && split.company === company ? split.title : split.company ? split.title : fullTitle,
      company: company || undefined,
      location: remote ? `Remote${where && !/^remote$/i.test(where) ? ` · ${where}` : ""}` : where,
      remote,
      url: link,
      applyUrl: link,
      descriptionHtml: decodeEntities(tag(item, ["content:encoded", "description", "content", "summary"])),
      postedAt: iso(tag(item, ["pubDate", "published", "updated", "dc:date"])),
    });
  }
  return { title: feedTitle, jobs };
}
