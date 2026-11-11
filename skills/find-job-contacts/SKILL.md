---
name: find-job-contacts
description: Find who to contact about a job in Hunt (the hiring managers and recruiters for it), with LinkedIn links and verified work emails, and record them on the job. Use after deciding to apply to a job, or when asked who to reach out to at a company.
---

# Find job contacts

Find up to 10 people for one job: the managers of the team that is hiring and the recruiters who hire engineers there. Get verified emails only for the few the person will actually contact. Uses [treg](https://treg.to/llms.txt) by default. Any people-data provider, or browsing LinkedIn yourself, works with the same steps.

## 1. Read the job

Call Hunt's `get_job`. Take the company, title, department or team, location, `company_domain` and `description`. If the description names someone ("you'll report to Jane Doe"), note the name and title.

`company_domain` is the employer's website. When it is empty, use the company's own website domain, never the job board's (greenhouse.io, lever.co, ashbyhq.com and the like).

## 2. Search in words

Describe the people in plain words and name the company in the text. Searching by `title` or `full_name` alone reaches cheap directory providers that return stale or wrong people.

```bash
treg call treg.people.search --method POST --header 'X-Treg-Route-Max-Cost: 0.05' \
  --data '{"q":"engineering managers and directors for <team or product> at <Company> in <city or country>","company_domain":"<domain>","limit":10}'

treg call treg.people.search --method POST --header 'X-Treg-Route-Max-Cost: 0.05' \
  --data '{"q":"technical recruiters at <Company> who hire software engineers in <country>","company_domain":"<domain>","limit":10}'
```

For a person the job post names, search `{"q":"<Name>, <title> at <Company>","limit":3}`.

- Keep `limit` at 10. Price grows with each person returned, and extra rows drift to other companies.
- For the place, use where the job is or, for a remote job, where the person lives. Location ranks people, it does not filter them.
- Over MCP, the same call is treg's `call` tool with the id and body.

## 3. Keep the right people

Each row has `name`, `title`, `company`, `location` and `profile_url`.

- Drop anyone whose `company` is not the employer. A subsidiary or product of it counts (Thunderbird for Mozilla).
- Drop people in the wrong role. An engineer on the team is a possible referral, so keep at most one or two.
- Remove duplicates by LinkedIn link.
- Turn a bare username into a link: `https://www.linkedin.com/in/<username>`.
- Keep up to 10, managers and recruiters closest to the job's team and place first.

## 4. Emails for the few you will contact

Only for the people the person will actually write to, 5 at most:

```bash
treg call treg.people.email.find --method POST --header 'X-Treg-Route-Max-Cost: 0.1' \
  --header 'X-Treg-Route-Verify: true' \
  --data '{"linkedin_url":"<link>","domain":"<domain>","full_name":"<name>"}'
```

Keep the email only when `_treg.verification.verdict` is `valid` and `_treg.domain_match` is `true`. Never repeat a find for the same person, since every hit is billed. Never guess an address.

## 5. Record it in Hunt

Call `update_job` with the job's id and the people as `contacts`. Hunt merges them by LinkedIn link or name, so saving again only updates.

```json
{
  "job_id": "<id>",
  "contacts": [
    { "name": "Jane Doe", "title": "Engineering Manager, Payments", "linkedin_url": "https://www.linkedin.com/in/janedoe", "email": "jane@acme.com", "email_verified": true }
  ]
}
```

After a message goes out, save the same person again with `contacted_at` (the date). Hunt never sends anything. Writing to someone is the person's decision. Cold-email rules differ by country (CASL in Canada, GDPR in the EU).

## 6. Report

Give the person the list with links and emails, and the cost. treg prints `charged $<amount>` on each call. Measured in testing, one search of 10 people cost about $0.007 and one verified email about $0.01, so a job costs about $0.02 to $0.06. Before running this for more than 5 jobs at once, tell the person the expected total.
