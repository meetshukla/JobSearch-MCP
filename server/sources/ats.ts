/**
 * Public job-board APIs. No keys, no scraping of logged-in pages.
 * Each adapter turns a company's board into RawJob rows.
 */
import { fetchJson, HttpError, pool } from "./http.ts";
import { htmlToText } from "../lib/html.ts";

export type RawJob = {
  extId: string;
  title: string;
  location: string;
  remote: boolean;
  department?: string;
  url: string;
  applyUrl?: string;
  descriptionHtml?: string;
  postedAt?: string;
  salary?: string;
  /** Company name for aggregator rows (company boards already know theirs). */
  company?: string;
  companyDomain?: string;
};

export type CompanyRef = { name: string; ats: string; slug: string; url?: string | null };

export type Adapter = {
  ats: string;
  label: string;
  boardUrl(slug: string, url?: string | null): string;
  fetchJobs(c: CompanyRef, ctx: { queries: string[] }): Promise<RawJob[]>;
  /** For boards whose list endpoint has no description. */
  fetchDetail?(c: CompanyRef, job: RawJob): Promise<Partial<RawJob>>;
  /** Returns the job count when the slug exists, otherwise null. */
  probe?(slug: string): Promise<number | null>;
};

const iso = (v: any): string | undefined => {
  if (v == null || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** Workday lists say "Posted Today", "Posted Yesterday", "Posted 3 Days Ago" or "Posted 30+ Days Ago". */
export function workdayPostedOn(text?: string | null): string | undefined {
  const t = (text || "").toLowerCase();
  if (!t) return undefined;
  const day = 86_400_000;
  if (/today|just posted|hours? ago/.test(t)) return new Date().toISOString();
  if (/yesterday/.test(t)) return new Date(Date.now() - day).toISOString();
  const m = t.match(/(\d+)\s*(\+)?\s*days?\s+ago/);
  if (m) return new Date(Date.now() - (Number(m[1]) + (m[2] ? 1 : 0)) * day).toISOString();
  return undefined;
}

const isRemoteText = (s: string) => /\bremote\b|work from home|\bwfh\b|anywhere|distributed/i.test(s);

async function probeCount(fn: () => Promise<number>): Promise<number | null> {
  try {
    const n = await fn();
    return n > 0 ? n : null;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400 || e.status === 410)) return null;
    return null;
  }
}

// ---------- Greenhouse ----------
const greenhouse: Adapter = {
  ats: "greenhouse",
  label: "Greenhouse",
  boardUrl: (slug) => `https://job-boards.greenhouse.io/${slug}`,
  // The list feed is light (no descriptions); descriptions are fetched only for jobs we keep.
  async fetchJobs(c) {
    const data = await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs`, { timeoutMs: 45_000 });
    return (data.jobs || []).map((j: any): RawJob => {
      const loc = j.location?.name || (j.offices || []).map((o: any) => o.name).join(", ") || "";
      return {
        extId: String(j.id),
        title: j.title,
        location: loc,
        remote: isRemoteText(loc),
        department: (j.departments || []).map((d: any) => d.name).filter(Boolean).join(", ") || undefined,
        url: j.absolute_url,
        applyUrl: j.absolute_url,
        // updated_at moves whenever a job is edited, so it is not a posting date.
        postedAt: iso(j.first_published),
      };
    });
  },
  async fetchDetail(c, job) {
    const j = await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs/${job.extId}?questions=false`);
    return {
      descriptionHtml: j.content,
      department: (j.departments || []).map((d: any) => d.name).filter(Boolean).join(", ") || job.department,
    };
  },
  probe: (slug) =>
    probeCount(async () => (await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)).jobs?.length ?? 0),
};

// ---------- Lever ----------
const lever: Adapter = {
  ats: "lever",
  label: "Lever",
  boardUrl: (slug) => `https://jobs.lever.co/${slug}`,
  async fetchJobs(c) {
    const data = await fetchJson<any[]>(`https://api.lever.co/v0/postings/${c.slug}?mode=json`, { timeoutMs: 45_000 });
    return (data || []).map((j: any): RawJob => {
      const lists = (j.lists || []).map((l: any) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join("");
      const loc = j.categories?.allLocations?.join(" / ") || j.categories?.location || "";
      const sr = j.salaryRange;
      return {
        extId: j.id,
        title: j.text,
        location: loc,
        remote: j.workplaceType === "remote" || isRemoteText(loc),
        department: [j.categories?.department, j.categories?.team].filter(Boolean).join(" · ") || undefined,
        url: j.hostedUrl,
        applyUrl: j.applyUrl || j.hostedUrl,
        descriptionHtml: `${j.description || ""}${lists}${j.additional || ""}`,
        postedAt: iso(j.createdAt),
        salary: sr ? `${sr.currency ?? ""} ${sr.min ?? ""}–${sr.max ?? ""} ${sr.interval ?? ""}`.trim() : undefined,
      };
    });
  },
  probe: (slug) => probeCount(async () => (await fetchJson<any[]>(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=200`)).length),
};

// ---------- Ashby ----------
// The public posting API returns every job's full description (OpenAI's is 13 MB). The job board's own
// listing query is ~80x smaller, so we list with it and fetch descriptions only for jobs we keep.
const ASHBY_GQL = "https://jobs.ashbyhq.com/api/non-user-graphql";
const ashbyQuery = (op: string, query: string, variables: Record<string, string>) =>
  fetchJson<any>(`${ASHBY_GQL}?op=${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationName: op, variables, query }),
    timeoutMs: 30_000,
  });

const ashby: Adapter = {
  ats: "ashby",
  label: "Ashby",
  boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  async fetchJobs(c) {
    const d = await ashbyQuery(
      "ApiJobBoardWithTeams",
      "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName workplaceType secondaryLocations { locationName } } } }",
      { organizationHostedJobsPageName: c.slug },
    );
    const posts = d?.data?.jobBoard?.jobPostings;
    if (!Array.isArray(posts)) throw new HttpError(404, `ashby:${c.slug}`, "board not found");
    return posts.map((j: any): RawJob => {
      const loc = [j.locationName, ...(j.secondaryLocations || []).map((x: any) => x.locationName)].filter(Boolean).join(" / ");
      return {
        extId: j.id,
        title: j.title,
        location: loc,
        remote: j.workplaceType === "Remote" || isRemoteText(loc),
        url: `https://jobs.ashbyhq.com/${c.slug}/${j.id}`,
        applyUrl: `https://jobs.ashbyhq.com/${c.slug}/${j.id}/application`,
      };
    });
  },
  async fetchDetail(c, job) {
    const d = await ashbyQuery(
      "ApiJobPosting",
      "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) { departmentName descriptionHtml compensationTierSummary publishedDate } }",
      { organizationHostedJobsPageName: c.slug, jobPostingId: job.extId },
    );
    const p = d?.data?.jobPosting ?? {};
    return {
      descriptionHtml: p.descriptionHtml,
      department: p.departmentName || job.department,
      salary: p.compensationTierSummary || job.salary,
      postedAt: iso(p.publishedDate) || job.postedAt,
    };
  },
  probe: (slug) =>
    probeCount(async () => (await fetchJson<any>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`)).jobs?.length ?? 0),
};

// ---------- SmartRecruiters ----------
const smartrecruiters: Adapter = {
  ats: "smartrecruiters",
  label: "SmartRecruiters",
  boardUrl: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
  async fetchJobs(c) {
    const out: RawJob[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const data = await fetchJson<any>(
        `https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&offset=${offset}`,
      );
      for (const j of data.content || []) {
        const l = j.location || {};
        const loc = l.fullLocation || [l.city, l.region, l.country?.toUpperCase()].filter(Boolean).join(", ");
        out.push({
          extId: String(j.id),
          title: j.name,
          location: loc,
          remote: Boolean(l.remote) || isRemoteText(loc),
          department: j.department?.label,
          url: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
          applyUrl: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
          postedAt: iso(j.releasedDate),
        });
      }
      if (!data.content?.length || offset + 100 >= (data.totalFound ?? 0)) break;
    }
    return out;
  },
  async fetchDetail(c, job) {
    const d = await fetchJson<any>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings/${job.extId}`);
    const s = d.jobAd?.sections || {};
    const html = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
      .map((k) => (s[k]?.text ? `<h3>${s[k].title || ""}</h3>${s[k].text}` : ""))
      .join("");
    return { descriptionHtml: html, applyUrl: d.applyUrl || job.applyUrl, url: d.postingUrl || job.url };
  },
  probe: (slug) =>
    probeCount(
      async () => (await fetchJson<any>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`)).totalFound ?? 0,
    ),
};

// ---------- Workable ----------
const workable: Adapter = {
  ats: "workable",
  label: "Workable",
  boardUrl: (slug) => `https://apply.workable.com/${slug}`,
  async fetchJobs(c) {
    const data = await fetchJson<any>(`https://apply.workable.com/api/v1/widget/accounts/${c.slug}?details=true`, {
      timeoutMs: 45_000,
    });
    return (data.jobs || []).map((j: any): RawJob => {
      const locs = (j.locations || []).filter((l: any) => !l.hidden).map((l: any) => [l.city, l.region, l.country].filter(Boolean).join(", "));
      const loc = locs.join(" / ") || [j.city, j.state, j.country].filter(Boolean).join(", ");
      return {
        extId: j.shortcode,
        title: j.title,
        location: loc,
        remote: Boolean(j.telecommuting) || isRemoteText(loc),
        department: j.department || undefined,
        url: j.url || j.shortlink,
        applyUrl: j.application_url || j.url,
        descriptionHtml: j.description,
        postedAt: iso(j.published_on || j.created_at),
      };
    });
  },
  probe: (slug) =>
    probeCount(async () => (await fetchJson<any>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`)).jobs?.length ?? 0),
};

// ---------- Recruitee ----------
const recruitee: Adapter = {
  ats: "recruitee",
  label: "Recruitee",
  boardUrl: (slug) => `https://${slug}.recruitee.com`,
  async fetchJobs(c) {
    const data = await fetchJson<any>(`https://${c.slug}.recruitee.com/api/offers/`);
    return (data.offers || []).map((j: any): RawJob => {
      const loc = j.location || [j.city, j.country].filter(Boolean).join(", ");
      return {
        extId: String(j.id),
        title: j.title,
        location: loc,
        remote: Boolean(j.remote) || isRemoteText(loc),
        department: j.department || undefined,
        url: j.careers_url,
        applyUrl: j.careers_apply_url || j.careers_url,
        descriptionHtml: `${j.description || ""}${j.requirements ? `<h3>Requirements</h3>${j.requirements}` : ""}`,
        postedAt: iso(j.published_at || j.created_at),
        salary: j.salary?.min ? `${j.salary.currency ?? ""} ${j.salary.min}–${j.salary.max ?? ""} ${j.salary.period ?? ""}`.trim() : undefined,
      };
    });
  },
  probe: (slug) => probeCount(async () => (await fetchJson<any>(`https://${slug}.recruitee.com/api/offers/`)).offers?.length ?? 0),
};

// ---------- Workday ----------
function workdayParts(c: CompanyRef) {
  const u = new URL(c.url || `https://${c.slug.split("/")[0]}.wd1.myworkdayjobs.com/${c.slug.split("/")[1]}`);
  const tenant = u.hostname.split(".")[0];
  const segs = u.pathname.split("/").filter(Boolean).filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s));
  const site = c.slug.includes("/") ? c.slug.split("/")[1] : segs[0];
  return { host: u.hostname, tenant, site };
}

const workday: Adapter = {
  ats: "workday",
  label: "Workday",
  boardUrl: (slug, url) => url || `https://${slug.split("/")[0]}.wd1.myworkdayjobs.com/${slug.split("/")[1]}`,
  async fetchJobs(c, ctx) {
    // Big tenants list thousands of jobs, 20 per page. Search by the roles we care about instead.
    const { host, tenant, site } = workdayParts(c);
    const api = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const seen = new Map<string, RawJob>();
    const queries = ctx.queries.length ? ctx.queries.slice(0, 6) : [""];
    for (const q of queries) {
      for (let offset = 0; offset < 60; offset += 20) {
        const data = await fetchJson<any>(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
        });
        const posts = data.jobPostings || [];
        for (const p of posts) {
          if (!p.externalPath) continue;
          const id = p.externalPath.split("_").pop() || p.externalPath;
          seen.set(id, {
            extId: id,
            title: p.title,
            location: p.locationsText || "",
            remote: isRemoteText(p.locationsText || "") || /remote/i.test(p.remoteType || ""),
            url: `https://${host}/${site}${p.externalPath}`,
            applyUrl: `https://${host}/${site}${p.externalPath}/apply`,
            postedAt: workdayPostedOn(p.postedOn),
          });
          (seen.get(id) as any)._path = p.externalPath;
        }
        if (posts.length < 20) break;
      }
    }
    return [...seen.values()];
  },
  async fetchDetail(c, job) {
    const { host, tenant, site } = workdayParts(c);
    const path = (job as any)._path || new URL(job.url).pathname.replace(new RegExp(`^/(?:[a-z]{2}-[A-Z]{2}/)?${site}`), "");
    const d = await fetchJson<any>(`https://${host}/wday/cxs/${tenant}/${site}${path}`);
    const info = d.jobPostingInfo || {};
    return {
      title: info.title || job.title,
      descriptionHtml: info.jobDescription,
      location: info.location || job.location,
      url: info.externalUrl || job.url,
      postedAt: iso(info.startDate) || job.postedAt,
    };
  },
};

export const ADAPTERS: Record<string, Adapter> = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee, workday };

export const PROBE_ORDER = ["greenhouse", "lever", "ashby", "workable", "recruitee", "smartrecruiters"] as const;

export function slugCandidates(name: string): string[] {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\b(inc|llc|ltd|limited|pvt|private|technologies|technology|labs|hq|corp|corporation|co)\b\.?/g, "")
    .trim();
  const words = base.split(/[\s.]+/).filter(Boolean);
  const c = new Set<string>([
    words.join(""),
    words.join("-"),
    name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    `${words.join("")}hq`,
    `${words.join("")}inc`,
    `${words.join("")}labs`,
    words[0] ?? "",
  ]);
  return [...c].filter((s) => s.length >= 2);
}

/** Find which public ATS a company uses. Returns every hit, most jobs first. */
export async function detectAts(name: string, slugHint?: string) {
  const slugs = slugHint ? [slugHint, ...slugCandidates(name)] : slugCandidates(name);
  const tries: { ats: string; slug: string }[] = [];
  for (const ats of PROBE_ORDER) for (const slug of [...new Set(slugs)].slice(0, 5)) tries.push({ ats, slug });
  const results = await pool(tries, 10, async (t) => ({ ...t, jobs: await ADAPTERS[t.ats].probe!(t.slug) }));
  return results.filter((r) => r.jobs).sort((a, b) => (b.jobs ?? 0) - (a.jobs ?? 0)) as { ats: string; slug: string; jobs: number }[];
}

/** Recognise a job or board URL from a known ATS. */
export function parseAtsUrl(raw: string): { ats: string; slug: string; jobId?: string; url?: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase();
  const p = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(h)) {
    const jobsIdx = p.indexOf("jobs");
    const slug = p[0] === "embed" ? u.searchParams.get("for") || "" : p[0];
    return slug ? { ats: "greenhouse", slug, jobId: jobsIdx >= 0 ? p[jobsIdx + 1] : u.searchParams.get("gh_jid") || undefined } : null;
  }
  if (h === "jobs.lever.co" || h === "jobs.eu.lever.co") return p[0] ? { ats: "lever", slug: p[0], jobId: p[1] } : null;
  if (h === "jobs.ashbyhq.com") return p[0] ? { ats: "ashby", slug: decodeURIComponent(p[0]), jobId: p[1] } : null;
  if (h === "jobs.smartrecruiters.com" || h === "careers.smartrecruiters.com")
    return p[0] ? { ats: "smartrecruiters", slug: p[0], jobId: p[1]?.split("-")[0] } : null;
  if (h === "apply.workable.com") return p[0] ? { ats: "workable", slug: p[0], jobId: p[1] === "j" ? p[2] : undefined } : null;
  if (h.endsWith(".recruitee.com")) return { ats: "recruitee", slug: h.split(".")[0], jobId: p[0] === "o" ? p[1] : undefined };
  if (h.includes(".myworkdayjobs.com")) {
    const segs = p.filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s));
    const tenant = h.split(".")[0];
    const site = segs[0];
    if (!site) return null;
    return { ats: "workday", slug: `${tenant}/${site}`, url: `https://${h}/${site}`, jobId: segs.includes("job") ? segs.at(-1)?.split("_").pop() : undefined };
  }
  return null;
}

export { htmlToText };
