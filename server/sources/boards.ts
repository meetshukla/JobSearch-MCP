/**
 * Search-based job boards (not tied to one company). Each one asks to be credited and linked
 * back to; we keep their URL as the job's URL and show the board name as the source.
 */
import { fetchJson, UA } from "./http.ts";
import { decodeEntities } from "../lib/html.ts";
import type { RawJob } from "./ats.ts";

export type Board = {
  id: string;
  label: string;
  note: string;
  search(query: string): Promise<RawJob[]>;
};

const iso = (v: any) => {
  if (v == null || v === "") return undefined;
  const d = typeof v === "number" || /^\d+$/.test(String(v)) ? new Date(Number(v) * (Number(v) > 1e12 ? 1 : 1000)) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

const remotive: Board = {
  id: "remotive",
  label: "Remotive",
  note: "Remote jobs, worldwide",
  async search(q) {
    const d = await fetchJson<any>(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=100`);
    return (d.jobs || []).map((j: any): RawJob => ({
      extId: String(j.id),
      title: j.title,
      company: (j.company_name || "").trim(),
      location: `Remote · ${j.candidate_required_location || "Worldwide"}`,
      remote: true,
      department: j.category,
      url: j.url,
      applyUrl: j.url,
      descriptionHtml: j.description,
      postedAt: iso(j.publication_date),
      salary: j.salary || undefined,
    }));
  },
};

const himalayas: Board = {
  id: "himalayas",
  label: "Himalayas",
  note: "Remote jobs with location restrictions",
  async search(q) {
    const out: RawJob[] = [];
    for (let page = 1; page <= 3; page++) {
      const d = await fetchJson<any>(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&page=${page}`);
      for (const j of d.jobs || []) {
        const where = (j.locationRestrictions || []).join(", ");
        out.push({
          extId: j.guid || j.applicationLink,
          title: j.title,
          company: j.companyName,
          location: `Remote${where ? ` · ${where}` : ""}`,
          remote: true,
          url: j.applicationLink || j.guid,
          applyUrl: j.applicationLink || j.guid,
          descriptionHtml: j.description,
          postedAt: iso(j.pubDate),
          salary: j.minSalary ? `${j.currency ?? ""} ${j.minSalary}–${j.maxSalary ?? ""}`.trim() : undefined,
        });
      }
      if ((d.jobs || []).length < 20) break;
    }
    return out;
  },
};

const jobicy: Board = {
  id: "jobicy",
  label: "Jobicy",
  note: "Remote jobs by tag",
  async search(q) {
    const d = await fetchJson<any>(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(q)}`);
    return (d.jobs || []).map((j: any): RawJob => ({
      extId: String(j.id),
      title: j.jobTitle,
      company: j.companyName,
      location: `Remote · ${j.jobGeo || "Anywhere"}`,
      remote: true,
      department: Array.isArray(j.jobIndustry) ? j.jobIndustry.join(", ") : j.jobIndustry,
      url: j.url,
      applyUrl: j.url,
      descriptionHtml: j.jobDescription,
      postedAt: iso(j.pubDate),
      salary: j.annualSalaryMin ? `${j.salaryCurrency ?? ""} ${j.annualSalaryMin}–${j.annualSalaryMax ?? ""}`.trim() : undefined,
    }));
  },
};

const arbeitnow: Board = {
  id: "arbeitnow",
  label: "Arbeitnow",
  note: "Europe (mostly Germany), no search: newest 600 jobs filtered locally",
  async search(q) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const out: RawJob[] = [];
    for (let page = 1; page <= 2; page++) {
      const d = await fetchJson<any>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of d.data || []) {
        const t = String(j.title || "").toLowerCase();
        if (words.length && !words.every((w) => t.includes(w))) continue;
        out.push({
          extId: j.slug,
          title: j.title,
          company: j.company_name,
          location: j.remote ? `Remote · ${j.location}` : j.location,
          remote: Boolean(j.remote),
          url: j.url,
          applyUrl: j.url,
          descriptionHtml: j.description,
          postedAt: iso(j.created_at),
        });
      }
    }
    return out;
  },
};

// ---------- We Work Remotely (category RSS; its search page is behind a bot wall) ----------
const WWR_CATEGORIES = [
  "remote-full-stack-programming-jobs", "remote-back-end-programming-jobs", "remote-front-end-programming-jobs", "remote-programming-jobs",
  "remote-design-jobs", "remote-devops-sysadmin-jobs", "remote-product-jobs", "remote-management-and-finance-jobs",
  "remote-customer-support-jobs", "remote-sales-and-marketing-jobs", "all-other-remote-jobs",
];
let wwrCache: { at: number; items: RawJob[] } | null = null;

const xmlTag = (item: string, tag: string) => {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
};

async function wwrAll(): Promise<RawJob[]> {
  if (wwrCache && Date.now() - wwrCache.at < 15 * 60_000) return wwrCache.items;
  const seen = new Map<string, RawJob>();
  await Promise.all(
    WWR_CATEGORIES.map(async (cat) => {
      try {
        const res = await fetch(`https://weworkremotely.com/categories/${cat}.rss`, { headers: { "User-Agent": UA } });
        if (!res.ok) return;
        const xml = await res.text();
        for (const item of xml.split("<item>").slice(1)) {
          const full = decodeEntities(xmlTag(item, "title"));
          const link = xmlTag(item, "link") || xmlTag(item, "guid");
          const i = full.indexOf(": ");
          if (!link || i < 0) continue;
          const region = decodeEntities(xmlTag(item, "region")) || "Anywhere in the World";
          seen.set(link, {
            extId: link,
            title: full.slice(i + 2),
            company: full.slice(0, i),
            location: `Remote · ${region.replace(/ Only$/, "")}`,
            remote: true,
            department: cat.replace(/^remote-|-jobs$/g, "").replaceAll("-", " "),
            url: link,
            applyUrl: link,
            descriptionHtml: decodeEntities(xmlTag(item, "description")),
            postedAt: iso(xmlTag(item, "pubDate")),
          });
        }
      } catch {
        /* one feed failing is fine */
      }
    }),
  );
  wwrCache = { at: Date.now(), items: [...seen.values()] };
  return wwrCache.items;
}

const weworkremotely: Board = {
  id: "weworkremotely",
  label: "We Work Remotely",
  note: "Remote jobs, tagged USA / North America / Anywhere",
  async search(q) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return (await wwrAll()).filter((j) => {
      const t = j.title.toLowerCase();
      return words.every((w) => t.includes(w) || t.includes(w.replace(/er$/, "")));
    });
  },
};

export const BOARDS: Record<string, Board> = { remotive, himalayas, jobicy, weworkremotely, arbeitnow };
