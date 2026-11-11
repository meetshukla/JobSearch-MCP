const NOW = "(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  ats TEXT,
  slug TEXT,
  url TEXT,
  domain TEXT,
  tags TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  last_read_at TEXT,
  last_error TEXT,
  listings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS sources_kind ON sources(kind, state);

CREATE TABLE IF NOT EXISTS board_queries (
  board TEXT NOT NULL,
  query TEXT NOT NULL,
  last_run_at TEXT,
  last_error TEXT,
  PRIMARY KEY (board, query)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source_id INTEGER,
  company TEXT NOT NULL,
  company_domain TEXT,
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  remote INTEGER NOT NULL DEFAULT 0,
  department TEXT,
  salary TEXT,
  url TEXT NOT NULL,
  apply_url TEXT,
  source TEXT NOT NULL,
  posted_at TEXT,
  description_html TEXT,
  description_text TEXT,
  details TEXT NOT NULL DEFAULT 'pending',
  detail_attempts INTEGER NOT NULL DEFAULT 0,
  listing_sig TEXT,
  dedupe_key TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL DEFAULT ${NOW},
  closed_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  status_at TEXT,
  verdict_score INTEGER,
  verdict_note TEXT,
  verdict_at TEXT,
  verdict_by TEXT,
  follow_up_at TEXT,
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, closed_at);
CREATE INDEX IF NOT EXISTS jobs_source ON jobs(source_id, closed_at);
CREATE INDEX IF NOT EXISTS jobs_dedupe ON jobs(dedupe_key);
CREATE INDEX IF NOT EXISTS jobs_details ON jobs(details, closed_at, detail_attempts);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  linkedin_url TEXT,
  email TEXT,
  email_verified INTEGER,
  note TEXT,
  contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS contacts_job ON contacts(job_id);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  by TEXT,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX IF NOT EXISTS events_job ON events(job_id, id)
`;

/** Columns added after the first release go here as [table, column, definition]. */
export const LATER_COLUMNS: [string, string, string][] = [];

/** Times are stored as ISO strings without milliseconds, so they compare correctly as text. */
export const isoAt = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
export const nowIso = () => isoAt(Date.now());
