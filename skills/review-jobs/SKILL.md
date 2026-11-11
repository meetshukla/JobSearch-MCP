---
name: review-jobs
description: Review new jobs in Hunt against the person's profile, give each a fit score with a one-line reason or skip it, and bring the best ones to the person. Use for a daily job review, or when asked which jobs are worth applying to.
---

# Review jobs

Hunt collects jobs and leaves the judging to you. This is one consistent way to judge. Change it to suit the person.

## 1. Know the person

Call `get_settings` and read `profile`: their resume, what they want, and what they won't accept. Note the deal-breakers (work authorization, relocation, on-site days, clearance, level, salary floor). If the profile is empty, ask the person for it and save it with `update_settings` before reviewing.

## 2. Triage from the list

Call `list_jobs` with `view: "to_review"` (50 at a time). Each row has the title, company, location, posting date and a short excerpt. Skip the obvious misses without opening them:

```json
{ "job_id": "<id>", "status": "skipped", "note": "Staff level, they're mid-level" }
```

Keep the note to one line with the deciding fact.

## 3. Read the promising ones

Call `get_job` and read the description. Check every deal-breaker first. A job that fails one is skipped, whatever else it offers. Watch for location limits written only in the description ("must be based in the US", "3 days a week in the office").

Then score it from 0 to 100:

| Score | Meaning |
|---|---|
| 85-100 | Strong. Meets every must-have, most of the stack and the level match. Apply. |
| 70-84 | Good. Worth a tailored application. |
| 50-69 | Stretch. Apply only if the person wants more volume. |
| below 50 | Skip instead of scoring. |

Weigh skills overlap, level, domain interest and logistics, roughly in that order. Record it:

```json
{ "job_id": "<id>", "verdict": { "score": 82, "note": "Go + Postgres backend, remote Canada, level matches; no payments experience" } }
```

The note cites the deciding facts, not adjectives.

## 4. Bring the shortlist to the person

`list_jobs` with `view: "shortlist"` gives your scored jobs, best first. Show the top ones with links and your notes, and let the person choose. Apply only with their go-ahead, or their standing rule (for example "apply to anything 85+").

## 5. After applying

Check the posting is still open first. Write the tailored resume on your side from the profile, never inventing facts. Then:

```json
{ "job_id": "<id>", "status": "applied", "note": "Applied on the company site with resume v4", "follow_up_at": "2026-11-20" }
```

When they reply, set `in_process`. When it ends, `rejected`. `today` lists follow-ups that are due.

For people to contact about a job, see the `find-job-contacts` skill.
