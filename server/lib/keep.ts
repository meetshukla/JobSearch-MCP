/**
 * A job someone touched (a verdict, a status, a note, a contact, or added by hand) is never
 * deleted: not when its source is removed and not by the hourly clean-up. Only untouched jobs go.
 */
export const UNTOUCHED = `status = 'new' AND verdict_score IS NULL AND pinned = 0
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.job_id = jobs.id)
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.job_id = jobs.id AND e.by IN ('you', 'agent'))`;

/** Bumped whenever sources are added, removed, paused or resumed, so the collector rebuilds its schedule. */
let version = 0;
export const sourcesChanged = () => void version++;
export const sourcesVersion = () => version;
