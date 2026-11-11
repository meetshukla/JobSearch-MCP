/**
 * The filter: one pure function used when collecting and when listing.
 * Phrases match whole words, case-insensitively ("engineer" matches "Senior Engineer II", not "Engineering").
 */
import type { Filters } from "../shared/types.ts";

export type Listing = {
  title: string;
  company: string;
  location: string;
  remote: boolean;
  posted_at?: string | null;
  description_text?: string | null;
  pinned?: boolean;
};

export type Match = { ok: true; reason: null } | { ok: false; reason: string };

/**
 * lenient: while collecting, a listing may not have its date or description yet (they arrive with the
 * description fetch). Unknowns pass then, and the strict check runs when the job is listed.
 */
export type MatchOptions = { lenient?: boolean; now?: number };

const pass: Match = { ok: true, reason: null };
const fail = (reason: string): Match => ({ ok: false, reason });

export function words(s: string) {
  return ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()} `;
}

/** The first phrase from `phrases` found in `text` (already passed through words()). */
function found(text: string, phrases: string[]) {
  for (const p of phrases) {
    const w = words(p);
    if (w.trim() && text.includes(w)) return p;
  }
  return null;
}

const REMOTE_WORDS = ["remote", "anywhere", "worldwide", "global", "globally", "distributed", "work from home", "wfh", "telecommute", "virtual", "home based"];
const FILLER = /\b(remote|anywhere|worldwide|global|globally|distributed|work from home|wfh|telecommute|virtual|home based|first|friendly|only|based|or|and|in|from|the|world|hybrid|flexible|position|role|location|locations|multiple|various|tbd|n a)\b/g;
/** Listings that say they're open everywhere pass any region. */
const OPEN_WORLD = ["worldwide", "anywhere", "global", "globally", "anywhere in the world", "international"];

export function isRemote(l: Pick<Listing, "remote" | "location">) {
  return l.remote || found(words(l.location), REMOTE_WORDS) != null;
}

/** "Remote" with no region named: what's left after removing remote words and filler is empty. */
export function remoteIsUnclear(location: string) {
  return words(location).replace(FILLER, " ").trim() === "";
}

export function ageDays(postedAt: string | null | undefined, now = Date.now()) {
  if (!postedAt) return null;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) ? null : (now - t) / 86_400_000;
}

function locationMatch(l: Listing, f: Filters): Match {
  const where = words(l.location);
  if (isRemote(l)) {
    if (f.remote) {
      if (!f.remote_regions.length) return pass;
      if (found(where, f.remote_regions) || found(where, OPEN_WORLD)) return pass;
      if (remoteIsUnclear(l.location)) return f.remote_unclear ? pass : fail("Remote, but doesn't say where it's open to");
    }
    // A remote listing can also name an office ("Remote - US / Toronto").
    if (f.onsite && f.places.length && found(where, f.places)) return pass;
    return fail(f.remote ? `Remote, limited to ${l.location.trim() || "an unlisted region"}` : "Remote");
  }
  if (!f.onsite) return fail("Not remote");
  if (!f.places.length) return pass;
  if (found(where, f.places)) return pass;
  return fail(l.location.trim() ? `In ${l.location.trim()}` : "No location listed");
}

export function matches(l: Listing, f: Filters, opts: MatchOptions = {}): Match {
  if (l.pinned) return pass;
  const title = words(l.title);
  if (f.titles.length && !found(title, f.titles)) return fail("Title doesn't match your titles");
  const skipTitle = found(title, f.skip_titles);
  if (skipTitle) return fail(`Title has "${skipTitle}"`);
  const skipCompany = found(words(l.company), f.skip_companies);
  if (skipCompany) return fail(`Skipped company "${skipCompany}"`);
  const loc = locationMatch(l, f);
  if (!loc.ok) return loc;
  const age = ageDays(l.posted_at, opts.now);
  if (age == null) {
    if (!opts.lenient && !f.show_undated) return fail("No posting date");
  } else if (f.posted_within_days != null && age > f.posted_within_days) {
    return fail(`Posted ${Math.floor(age)} days ago`);
  }
  if (l.description_text && f.skip_if_description.length) {
    const hit = found(words(l.description_text), f.skip_if_description);
    if (hit) return fail(`Description mentions "${hit}"`);
  }
  return pass;
}
