# Setting up Hunt for someone

You are an agent setting up Hunt for a person who is looking for a job. Hunt collects job postings from the sources you choose, keeps the ones that pass the person's filters, and tracks what happens next. You do the judging and the applying. This file is the whole setup. It takes about ten minutes plus an hour for the first jobs to arrive.

## 1. Deploy

The person needs a Cloudflare account (the free plan is enough) and Node 20 or later.

```bash
git clone <this repo> hunt && cd hunt
npm install
npx wrangler login          # opens the browser once
npm run deploy              # prints the URL, e.g. https://hunt.<their-subdomain>.workers.dev
openssl rand -hex 24        # the token; give it to the person to keep in their password manager
npx wrangler secret put HUNT_TOKEN   # paste the token
```

The website is at the printed URL. The person signs in once with the token. To use their own domain: `npm run build && npx wrangler deploy --domain jobs.example.com`.

## 2. Connect yourself

The MCP server is `<url>/mcp` and takes the token as a bearer token. Keep the token in the `HUNT_TOKEN` environment variable.

```bash
codex mcp add hunt --url https://hunt.example.workers.dev/mcp --bearer-token-env-var HUNT_TOKEN
claude mcp add --transport http hunt https://hunt.example.workers.dev/mcp --header "Authorization: Bearer $HUNT_TOKEN"
```

Call `get_settings`. Its `setup` field lists what's missing.

## 3. Ask the person

Keep it short. You need:

- their resume (pasted text or a file you can read)
- where they live, and where they can work: cities for on-site or hybrid, regions for remote
- the titles they want and their level
- deal-breakers: work authorization, relocation, office days, clearance, salary floor
- how fresh jobs should be (default: posted in the last 7 days)

## 4. Save the profile

`update_settings` with `profile`: the resume, then a short "What I want" and "Won't accept" section in their words. Hunt stores it for you and other agents; it does nothing with it.

## 5. Set the filters

`update_settings` with `filters`. Send only what you change; the rest keep their defaults. Check the effect with `preview: true` first.

| Field | Default | Notes |
|---|---|---|
| `titles` | software engineer, software developer | Whole-word phrases, any case. Add the variants companies use: "backend engineer", "full stack", "platform engineer". Empty keeps every title. |
| `skip_titles` | intern, internship, co-op, new grad, sales engineer, solutions engineer, support engineer | |
| `onsite`, `places` | on, empty | Places as companies write them: "Toronto", "GTA", "Berlin". Empty means anywhere. |
| `remote`, `remote_regions` | on, empty | Regions as companies write them: "Canada", "North America", "Americas", "EU", "Worldwide". Empty means any region. |
| `remote_unclear` | on | Keeps remote jobs that only say "Remote". You check where they're open to. |
| `posted_within_days` | 7 | `null` keeps any age. |
| `show_undated` | off | Some boards give no posting date. |
| `skip_if_description` | empty | Phrases that rule a job out, as written: "US citizenship", "security clearance". |
| `skip_companies` | empty | |

Hunt matches the location text the company wrote. "Remote - US" is dropped when the regions don't include "US", even if the description says Canada is fine. If the person would take those, add the region and judge each job yourself.

## 6. Add sources

Pick companies that fit this person: their field, their city, the size of company they want. `add_sources` takes many at once:

- a company name: "Shopify" (Hunt looks for its public job board)
- a careers page or job board URL
- "greenhouse:stripe" or "ashby:linear": the board system and the company's slug in its board URL (also lever, smartrecruiters, workable, recruitee)
- an RSS or Atom feed of jobs
- `list: "north-america-tech"`: 1,000 tech companies, mostly in the US and Canada. Use it only if it fits.

Five remote job boards come built in (Remotive, Himalayas, Jobicy, We Work Remotely, Arbeitnow). Remove the ones that don't fit with `update_sources`.

Names and unknown URLs are queued. After a few minutes, `list_sources` with `state: "error"` shows the ones Hunt couldn't resolve. Many companies use their own careers site: add the careers page URL instead, or track their jobs one by one with `add_job`. Hunt reads each company board about once an hour; with more than about 1,000 boards a full pass takes longer.

## 7. Check and hand over

After an hour, call `list_jobs` and `list_sources`. If there are too many or too few jobs, adjust the filters with the person. Then give them the website URL and explain the daily routine: you review new jobs and they decide where to apply.

## Every day

Follow `skills/review-jobs/SKILL.md`. For people to contact about a job, `skills/find-job-contacts/SKILL.md`.

Change the profile or filters only when the person asks.
