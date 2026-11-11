import assert from "node:assert/strict";
import { matches, remoteIsUnclear } from "../server/filters.ts";
import { DEFAULT_FILTERS, normalizeFilters } from "../server/settings.ts";
import type { Filters } from "../shared/types.ts";

const now = Date.parse("2026-11-11T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const f = (over: Partial<Filters>) => normalizeFilters(over, DEFAULT_FILTERS);
const job = (over: Record<string, unknown>) => ({ title: "Senior Software Engineer", company: "Acme", location: "Toronto, ON", remote: false, posted_at: daysAgo(1), ...over });

const ottawa = f({ places: ["Ottawa", "Toronto"], remote_regions: ["Canada", "North America"] });
const ok = (j: any, fl: Filters, lenient = false) => matches(j, fl, { now, lenient }).ok;

assert.equal(ok(job({}), ottawa), true, "on-site in a listed place");
assert.equal(ok(job({ location: "San Francisco, CA" }), ottawa), false, "on-site elsewhere");
assert.equal(ok(job({ location: "Remote - Canada", remote: true }), ottawa), true, "remote open to a listed region");
assert.equal(ok(job({ location: "Remote - US" }), ottawa), false, "remote limited to another region");
assert.equal(ok(job({ location: "Remote - United States / Remote - Canada" }), ottawa), true, "remote with several regions");
assert.equal(ok(job({ location: "Remote", remote: true }), ottawa), true, "unclear remote kept by default");
assert.equal(ok(job({ location: "Remote", remote: true }), f({ ...ottawa, remote_unclear: false })), false, "unclear remote can be dropped");
assert.equal(ok(job({ location: "Remote - US / Toronto, ON" }), ottawa), true, "remote elsewhere but office in a listed place");
assert.equal(ok(job({ location: "Toronto (Hybrid)" }), ottawa), true, "hybrid in a listed place");
assert.equal(ok(job({ location: "Remote - Canada" }), f({ ...ottawa, remote: false })), false, "remote off");
assert.equal(ok(job({}), f({ ...ottawa, onsite: false })), false, "on-site off");
assert.equal(ok(job({ location: "Berlin" }), f({})), true, "no places means anywhere");

assert.equal(ok(job({ title: "Software Engineering Manager" }), ottawa), false, "'software engineer' is a whole-word phrase");
assert.equal(ok(job({ title: "Software Engineer Intern" }), ottawa), false, "skip titles");
assert.equal(ok(job({ title: "Data Scientist" }), f({ ...ottawa, titles: [] })), true, "empty titles keeps all");

assert.equal(ok(job({ posted_at: daysAgo(8) }), ottawa), false, "older than 7 days");
assert.equal(ok(job({ posted_at: daysAgo(8) }), f({ ...ottawa, posted_within_days: null })), true, "no age limit");
assert.equal(ok(job({ posted_at: null }), ottawa), false, "undated hidden by default");
assert.equal(ok(job({ posted_at: null }), ottawa, true), true, "undated passes while collecting");
assert.equal(ok(job({ posted_at: null }), f({ ...ottawa, show_undated: true })), true, "undated can be shown");

const cit = f({ ...ottawa, skip_if_description: ["US citizenship"] });
assert.equal(ok(job({ description_text: "Requires U.S. citizenship" }), cit), true, "phrase must match words as written");
assert.equal(ok(job({ description_text: "Must have US citizenship." }), cit), false, "description skip");
assert.equal(ok(job({ company: "Acme Corp" }), f({ ...ottawa, skip_companies: ["acme"] })), false, "company skip");
assert.equal(ok(job({ title: "Barista", pinned: true }), ottawa), true, "pinned always shows");

assert.equal(remoteIsUnclear("Remote"), true);
assert.equal(remoteIsUnclear("Remote (Anywhere)"), true);
assert.equal(remoteIsUnclear("Remote - EMEA"), false);
assert.equal(normalizeFilters({ posted_within_days: 0 } as any).posted_within_days, null, "0 days means no limit");

console.log("filters: all checks passed");
