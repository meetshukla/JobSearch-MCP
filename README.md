# Hunt

Hunt collects job postings from the boards you choose, keeps the ones that pass your filters, and tracks every application. Your agent (Codex, Claude Code, or any MCP client) does the rest: it reviews the new jobs, judges the fit against your profile, applies in its own browser, and records what happened.

It runs on your own Cloudflare account on the free plan. No AI inside, no API keys besides your own token, no data leaving your account.

## How it works

| | Hunt | Your agent |
|---|---|---|
| Find | Reads company job boards, remote job boards and RSS feeds about once an hour | Picks the sources for you |
| Filter | Keeps jobs that pass your filters: titles, places, remote regions, how recent, words to skip | Sets the filters with you |
| Judge | | Reads each new job against your profile and writes a score and a one-line reason |
| Apply | | Writes the tailored resume and applies |
| Track | Status, notes, contacts, follow-up dates, a timeline per job | Records everything as it goes |

Hunt has opinions (posted in the last 7 days, no internships, a starter list of companies) and every one of them is a setting you can change or turn off.

## Deploy

You need a Cloudflare account (free) and Node 20 or later.

```bash
git clone <this repo> hunt && cd hunt
npm install
npx wrangler login
npm run deploy                        # prints your URL, e.g. https://hunt.<you>.workers.dev
openssl rand -hex 24                  # your token: keep it in a password manager
npx wrangler secret put HUNT_TOKEN    # paste the token
```

Open the URL, sign in with the token, and follow Setup. Or hand this repo to your agent: [AGENTS.md](AGENTS.md) walks it through the whole setup.

To use your own domain, add a `routes` entry to `wrangler.jsonc` (there is a commented example) and deploy again.

## Connect your agent

The MCP server is `<your url>/mcp` and takes your token as a bearer token.

```bash
export HUNT_TOKEN=...   # in your shell profile

codex mcp add hunt --url https://hunt.<you>.workers.dev/mcp --bearer-token-env-var HUNT_TOKEN
claude mcp add --transport http hunt https://hunt.<you>.workers.dev/mcp --header "Authorization: Bearer $HUNT_TOKEN"
```

Then ask it: "Use Hunt. Start with today."

## Tools

| Tool | What it does |
|---|---|
| `today` | What's missing from setup, new jobs your agent hasn't scored, scored ones waiting for a decision, applications by stage, follow-ups due, source health |
| `get_settings`, `update_settings` | Your profile (resume and what you want, plain text) and your filters, with a preview of how many jobs a change would show |
| `add_sources`, `list_sources`, `update_sources` | Company names, careers pages, job board URLs, RSS feeds, remote boards, or a starter list. Pause, resume, remove, read now. |
| `list_jobs`, `get_job` | Three views: **jobs** (new only, what agents read), **applied** (applied, in process, rejected) and **skipped**. Short rows to triage, the full job to read. |
| `add_job` | Track any job from a link, whatever the filters say |
| `update_job` | Verdict (score and why), status, notes, contacts, follow-up date |

The website calls the same tools, so what your agent sees and what you see never differ. Definitions: [`server/tools.ts`](server/tools.ts).

## Sources

- **Company job boards:** Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee and Workday. Add a company by name and Hunt finds its board, or paste its careers page or board URL.
- **Remote job boards:** Remotive, Himalayas, Jobicy, We Work Remotely and Arbeitnow, on by default.
- **RSS and Atom feeds** of job postings.
- **One job at a time** from any posting with schema.org job data.
- **Starter list:** [`lists/north-america-tech.json`](lists/north-america-tech.json), 1,000 tech companies with public boards, mostly in the US and Canada. Optional.

## Skills

Optional skills for your agent, in [`skills/`](skills). Copy a folder into your agent's skills folder (for example `~/.claude/skills/`).

- [`review-jobs`](skills/review-jobs/SKILL.md): one consistent way to judge fit, score jobs and bring the best ones to you.
- [`find-job-contacts`](skills/find-job-contacts/SKILL.md): finds the hiring managers and recruiters for a job, with LinkedIn links and verified emails, and saves them on the job. Uses [treg](https://treg.to/llms.txt) by default; any people-data provider works.

## Limits

Cloudflare's free plan allows 50 outside requests per run, so Hunt works in small steps every 15 seconds: four company boards, one remote-board search or feed, and six job descriptions. That reads about 1,000 company boards an hour. With more boards, a full pass takes proportionally longer.

## Develop

```bash
npm run dev                                                      # http://localhost:8787, no sign-in
node scripts/mcp.ts http://localhost:8787                        # list the tools
node scripts/mcp.ts http://localhost:8787 today                  # call one
npm test                                                         # filter tests
npm run typecheck
```

| Path | |
|---|---|
| `server/filters.ts` | The filter, one pure function used when collecting and when listing |
| `server/lib/collect.ts` | The collector that runs every 15 seconds |
| `server/lib/sources.ts` | Adding and resolving sources |
| `server/lib/jobs.ts` | Lists, one job, tracking, the daily agenda |
| `server/sources/` | Readers for each job board system, remote board and RSS |
| `server/tools.ts`, `server/mcp.ts` | The tools and the MCP server |
| `shared/types.ts` | Shapes shared by the server and the website |
| `client/` | The website (React) |
| `worker/` | The Cloudflare Worker and Durable Object |

## Contributing

Pull requests are welcome. The most useful ones:

- **A new job board system** (Personio, Teamtailor, BambooHR, ...): an adapter in [`server/sources/ats.ts`](server/sources/ats.ts) and its URL pattern in `parseAtsUrl`.
- **A starter list for your region:** a JSON file in [`lists/`](lists) and one line in [`server/lib/lists.ts`](server/lib/lists.ts).
- **A remote job board:** [`server/sources/boards.ts`](server/sources/boards.ts).

## License

[MIT](LICENSE)
