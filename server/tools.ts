/**
 * Everything Hunt can do, as one list of tools. The MCP server (/mcp) exposes them to agents and the
 * website calls the same tools (/api/tools/<name>), so the two never drift apart.
 */
import { z } from "zod";
import { getSettings, saveSettings, normalizeFilters, DEFAULT_FILTERS } from "./settings.ts";
import { listJobs, getJob, updateJob, today } from "./lib/jobs.ts";
import { addJob } from "./lib/addJob.ts";
import { addSources, listSources, updateSources, markAllDue } from "./lib/sources.ts";
import { LISTS } from "./lib/lists.ts";
import { run } from "./db.ts";
import { broadcast } from "./lib/events.ts";
import { STATUSES, VIEWS } from "../shared/types.ts";

export type ToolCtx = { by: "agent" | "you"; wake?: () => void };
export type Tool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<any>;
  readOnly?: boolean;
  run: (args: any, ctx: ToolCtx) => unknown | Promise<unknown>;
};

export const INSTRUCTIONS = `Hunt collects job postings for one person from the company job boards, remote job boards and RSS feeds you add, keeps the ones that pass their filters, and tracks what happens next. It has no opinion on fit: you judge each job.

Start every session with today. It lists what's missing from setup, how many jobs wait for review, and follow-ups that are due.

Setup, once:
1. update_settings.profile: the person's resume and what they want and won't accept, as plain text. Read it back with get_settings before judging jobs.
2. update_settings.filters: titles, where they can work (places, remote_regions), posted_within_days, words to skip. Every filter is optional. Use preview: true to see how many jobs a change would show before saving.
3. add_sources: company names, careers page URLs, job board URLs ("greenhouse:stripe" works too), RSS feeds, or list: "north-america-tech" for a starter list of 1,000 companies. Pick companies that fit the person; nothing is required.

Every day:
1. list_jobs view "to_review": new jobs that pass the filters. Rows are short; open the promising ones with get_job.
2. For each job you review, call update_job with a verdict (score 0-100 and one line why), or status "skipped" with a note.
3. Before applying, open the posting and check it's still open. Write the tailored resume on your side; Hunt doesn't make documents.
4. After applying: update_job status "applied" with a note of what was sent, and a follow_up_at date. Then "in_process" when they reply, or "rejected".
5. People to contact: save them with update_job.contacts (name, title, linkedin_url, email, email_verified, contacted_at). The find-job-contacts skill in Hunt's repo shows one way to find them.

Change the profile or filters only when the person asks.`;

const jobId = z.string().describe("Job id from list_jobs");
const filtersShape = z
  .object({
    titles: z.array(z.string()).describe("Keep titles containing any of these phrases (whole words, any case). Empty keeps every title."),
    skip_titles: z.array(z.string()).describe("Drop titles containing any of these phrases"),
    onsite: z.boolean().describe("Keep on-site and hybrid jobs"),
    places: z.array(z.string()).describe('On-site or hybrid jobs must be in one of these places, as companies write them ("Toronto", "Berlin"). Empty = anywhere.'),
    remote: z.boolean().describe("Keep remote jobs"),
    remote_regions: z.array(z.string()).describe('Remote jobs must be open to one of these ("Canada", "EU", "Worldwide"). Empty = any region.'),
    remote_unclear: z.boolean().describe("Keep remote jobs that don't say where they're open to"),
    posted_within_days: z.number().int().min(1).nullable().describe("Keep jobs posted within this many days. null = any age."),
    show_undated: z.boolean().describe("Keep jobs whose board gives no posting date"),
    skip_if_description: z.array(z.string()).describe("Drop jobs whose description mentions any of these phrases"),
    skip_companies: z.array(z.string()).describe("Drop jobs from these companies"),
  })
  .partial();

const contactShape = z.object({
  name: z.string().min(1),
  title: z.string().nullish(),
  linkedin_url: z.string().nullish().describe("Full link or just the username"),
  email: z.string().nullish(),
  email_verified: z.boolean().nullish(),
  note: z.string().max(1000).nullish(),
  contacted_at: z.string().nullish().describe("Date you contacted them, e.g. 2026-11-12"),
});

export class ToolError extends Error {}

export const TOOLS: Tool[] = [
  {
    name: "today",
    title: "Today",
    description: "Start here. What's missing from setup, how many jobs wait for review, jobs on the shortlist, applications, follow-ups due, every view's size, and whether the sources are being read.",
    input: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The person's local date, so follow-ups are due at their midnight. Defaults to UTC.") }),
    readOnly: true,
    run: (a) => today(a.date),
  },
  {
    name: "get_settings",
    title: "Get settings",
    description: "The person's profile (resume and what they want, as plain text) and the filters that decide which jobs are kept. Also the default filters and the starter lists, for reference.",
    input: z.object({}),
    readOnly: true,
    run: () => ({ ...getSettings(), default_filters: DEFAULT_FILTERS, lists: Object.entries(LISTS).map(([id, l]) => ({ id, label: l.label, companies: l.companies.length })) }),
  },
  {
    name: "update_settings",
    title: "Update settings",
    description:
      "Change the profile and/or filters. Filters merge: send only the fields you change. Saving new filters re-reads every source within the hour so newly matching jobs come in. preview: true saves nothing and returns how many jobs would wait for review. Only change these when the person asks.",
    input: z.object({
      profile: z.string().max(60_000).optional().describe("Resume and what the person wants and won't accept, as plain text or Markdown"),
      filters: filtersShape.optional(),
      preview: z.boolean().optional(),
    }),
    run: (a, ctx) => {
      const cur = getSettings();
      const filters = a.filters ? normalizeFilters(a.filters, cur.filters) : cur.filters;
      if (a.preview) {
        const before = listJobs({ limit: 1 }).counts.to_review;
        const after = listJobs({ limit: 1 }, filters).counts.to_review;
        return { to_review_now: before, to_review_with_these_filters: after, note: "Counts jobs already collected. Saving also re-reads every source, which can bring in more." };
      }
      const changed = JSON.stringify(filters) !== JSON.stringify(cur.filters);
      saveSettings({ profile: a.profile ?? cur.profile, filters });
      if (changed) {
        markAllDue();
        run("UPDATE jobs SET details = 'pending' WHERE details = 'skipped'");
        ctx.wake?.();
      }
      broadcast("settings");
      broadcast("jobs");
      return { saved: true, filters, profile_chars: (a.profile ?? cur.profile).length, rereading_sources: changed };
    },
  },
  {
    name: "add_sources",
    title: "Add sources",
    description:
      'Add where jobs come from, many at once. Each item: a company name ("Shopify"), a careers page or job board URL, "greenhouse:stripe" style (greenhouse, lever, ashby, smartrecruiters, workable, recruitee), an RSS/Atom feed URL, or a remote board id (remotive, himalayas, jobicy, weworkremotely, arbeitnow). Board URLs are added at once; names and other URLs are queued and resolved within minutes (check list_sources). list imports a starter list.',
    input: z.object({
      items: z.array(z.string().min(1)).max(500).optional(),
      list: z.string().optional().describe(`Starter list id: ${Object.keys(LISTS).join(", ")}`),
    }),
    run: (a, ctx) => {
      if (!a.items?.length && !a.list) throw new ToolError("Give items, a list, or both.");
      const r = addSources(a);
      ctx.wake?.();
      return { results: r };
    },
  },
  {
    name: "list_sources",
    title: "List sources",
    description:
      "Sources with their state (queued, active, paused, error), last read, postings on the board and how many of their open jobs pass the filters. Errors first. Use it to check queued names resolved and to prune sources that never match.",
    input: z.object({
      state: z.enum(["queued", "active", "paused", "error"]).optional(),
      kind: z.enum(["company", "board", "feed"]).optional(),
      query: z.string().optional().describe("Text in the name or tags"),
      limit: z.number().int().min(1).max(500).optional().describe("Default 50"),
      offset: z.number().int().min(0).optional(),
    }),
    readOnly: true,
    run: (a) => listSources(a),
  },
  {
    name: "update_sources",
    title: "Update sources",
    description: "Pause, resume, remove, or read now. Removing a source also removes its untouched jobs; jobs you acted on stay.",
    input: z.object({ ids: z.array(z.number().int()).min(1).max(500), action: z.enum(["pause", "resume", "remove", "read_now"]) }),
    run: (a, ctx) => {
      const r = updateSources(a.ids, a.action);
      if (a.action === "read_now" || a.action === "resume") ctx.wake?.();
      return r;
    },
  },
  {
    name: "list_jobs",
    title: "List jobs",
    description:
      "Jobs as short rows (title, company, location, posted, verdict, status, a 240-character excerpt). Views: to_review (new, passes the filters, no verdict yet; default), shortlist (new with your verdict, best first), applied (applied and in process), follow_ups (applications with a follow-up date, soonest first), skipped, rejected, all. counts gives every view's size. posted_within_days overrides the saved window for this call (null = any age); ignore_filters shows every stored job.",
    input: z.object({
      view: z.enum(VIEWS).optional(),
      query: z.string().optional().describe("Text in the title, company or location"),
      company: z.string().optional(),
      remote_only: z.boolean().optional(),
      posted_within_days: z.number().int().min(1).nullable().optional(),
      ignore_filters: z.boolean().optional(),
      sort: z.enum(["posted", "verdict", "seen", "updated"]).optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
      offset: z.number().int().min(0).optional(),
    }),
    readOnly: true,
    run: (a) => listJobs(a),
  },
  {
    name: "get_job",
    title: "Get a job",
    description: "One job in full: description, apply link, whether it passes the filters (and why not), verdict, contacts and timeline.",
    input: z.object({ job_id: jobId, max_description_chars: z.number().int().min(0).max(60_000).optional(), html: z.boolean().optional() }),
    readOnly: true,
    run: (a) => {
      const j = getJob(a.job_id, { html: a.html, maxChars: a.max_description_chars });
      if (!j) throw new ToolError(`No job with id ${a.job_id}.`);
      return j;
    },
  },
  {
    name: "add_job",
    title: "Track a job from a link",
    description: "Track one job from any link: a job board posting (Greenhouse, Lever, Ashby, ...) or any page with schema.org job data. It always shows, whatever the filters say.",
    input: z.object({ url: z.string().url(), note: z.string().max(2000).optional() }),
    run: async (a, ctx) => getJob(await addJob(a.url, ctx.by, a.note), { maxChars: 0 }),
  },
  {
    name: "update_job",
    title: "Update a job",
    description: `Record what happened. status: ${STATUSES.join(", ")} (new = not decided; in_process = they replied, interviews, offers). verdict: your score 0-100 and one line why (null clears it). note: free text on the timeline. contacts: people for this job, merged by LinkedIn link or name. follow_up_at: a date to come back to it (null clears).`,
    input: z.object({
      job_id: jobId,
      status: z.enum(STATUSES).optional(),
      verdict: z.object({ score: z.number().min(0).max(100), note: z.string().min(1).max(1000) }).nullable().optional(),
      note: z.string().max(4000).optional(),
      contacts: z.array(contactShape).max(50).optional(),
      follow_up_at: z.string().nullable().optional(),
    }),
    run: (a, ctx) => updateJob(a, ctx.by),
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export async function callTool(name: string, args: unknown, ctx: ToolCtx) {
  const t = byName.get(name);
  if (!t) throw new ToolError(`Unknown tool ${name}. Tools: ${TOOLS.map((x) => x.name).join(", ")}`);
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) throw new ToolError(`Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  try {
    return await t.run(parsed.data, ctx);
  } catch (e: any) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(String(e?.message || e));
  }
}

let listCache: any[] | null = null;
export function toolList() {
  listCache ??= TOOLS.map((t) => {
    const schema: any = z.toJSONSchema(t.input, { io: "input" });
    delete schema.$schema;
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: schema,
      annotations: { title: t.title, readOnlyHint: Boolean(t.readOnly), destructiveHint: t.name === "update_sources", openWorldHint: ["add_sources", "add_job"].includes(t.name) },
    };
  });
  return listCache;
}
