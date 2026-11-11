import { run } from "../db.ts";

// Recent changes for the website, which polls /api/pulse. Lives in the Durable Object's memory.
const instance = Math.random().toString(36).slice(2, 10);
let version = 0;
const ring: { v: number; type: string }[] = [];

export type Topic = "jobs" | "job" | "sources" | "settings";

export function broadcast(type: Topic) {
  version++;
  ring.push({ v: version, type });
  if (ring.length > 300) ring.splice(0, ring.length - 300);
}

/** Changes after `since`. A different instance (a restart) tells the client to reload everything. */
export function pulse(since: number, from?: string) {
  const reset = (from && from !== instance) || (since < (ring[0]?.v ?? version + 1) - 1 && since < version);
  return { instance, version, reset: Boolean(reset), changes: reset ? [] : ring.filter((r) => r.v > since).map((r) => r.type) };
}

/** One line on a job's timeline. */
export function addEvent(jobId: string | null, kind: string, text: string, by: "you" | "agent" | "hunt" = "hunt", data?: Record<string, unknown>) {
  run("INSERT INTO events (job_id, kind, text, by, data) VALUES (?, ?, ?, ?, ?)", jobId, kind, text.slice(0, 2000), by, data ? JSON.stringify(data) : null);
}
