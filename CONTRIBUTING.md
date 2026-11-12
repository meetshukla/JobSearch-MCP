# Contributing to Hunt

Pull requests are welcome. A small fix needs no issue first. For a bigger change, open an issue so we agree on the shape before you write it.

## Run Hunt on your machine

You need Node 22.18 or later. No Cloudflare account is needed to develop.

```bash
git clone https://github.com/meetshukla/JobSearch-MCP hunt
cd hunt
npm install
npm run dev    # http://localhost:8787, no sign-in
```

`npm run dev` builds the website and runs the Worker locally, with its database in `.wrangler/`. In a second terminal, call the tools the way an agent does:

```bash
node scripts/mcp.ts http://localhost:8787                                              # list the tools
node scripts/mcp.ts http://localhost:8787 add_sources '{"items":["greenhouse:stripe"]}'
node scripts/mcp.ts http://localhost:8787 list_jobs
```

## Before you open a pull request

- Run `npm run typecheck` and `npm test`. Both must pass.
- For a change to the website, add a screenshot to the pull request. If you changed colors, add one in light and one in dark. Check the page at phone width too. [`client/DESIGN.md`](client/DESIGN.md) has the design rules.
- Keep each pull request to one change.

Two rules hold Hunt together:

- **It runs on Cloudflare's free plan.** Each run can make at most 50 requests to other websites, so the collector spends a budget of 42 per run (`BUDGET` in [`server/lib/collect.ts`](server/lib/collect.ts)). A change must stay inside that budget and add no paid service.
- **It has no AI inside.** Hunt collects and tracks. Judging a job belongs to the user's agent.

## Good first changes

- **A new job board system** such as Personio, Teamtailor or BambooHR. Write an adapter in [`server/sources/ats.ts`](server/sources/ats.ts), add it to `ADAPTERS`, and teach `parseAtsUrl` its board URLs.
- **A starter list for your region.** Add a JSON file in [`lists/`](lists) shaped like `north-america-tech.json`, and add it to `LISTS` in [`server/lib/lists.ts`](server/lib/lists.ts).
- **A remote job board.** Add a reader to `BOARDS` in [`server/sources/boards.ts`](server/sources/boards.ts).
- **A dead board in a starter list.** Import the list locally, wait a few minutes, and run `list_sources` with `{"state":"error"}`. Fix the slug or remove the company.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
