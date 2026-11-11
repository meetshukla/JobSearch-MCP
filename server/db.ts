/**
 * Synchronous SQL with a pluggable backend:
 *  - on the Mac: node:sqlite (see db-node.ts)
 *  - on Cloudflare: the Durable Object's SQLite (see worker/db-do.ts)
 * Both are synchronous, so the rest of Hunt is the same code in both places.
 */
export type RunResult = { changes: number; lastInsertRowid: number };
export interface SqlBackend {
  all(sql: string, params: any[]): any[];
  run(sql: string, params: any[]): RunResult;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  columns(table: string): string[];
}

let backend: SqlBackend | null = null;
export function setBackend(b: SqlBackend) {
  backend = b;
}
function B() {
  if (!backend) throw new Error("Database not initialised");
  return backend;
}

export const db = {
  exec: (sql: string) => B().exec(sql),
};

export function initSchema(schemaSql: string, laterColumns: [string, string, string][] = []) {
  B().exec(schemaSql);
  for (const [table, col, def] of laterColumns) {
    if (!B().columns(table).includes(col)) B().exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

export type Row = Record<string, any>;

// SQLite in Durable Objects allows at most 100 bound parameters per query.
const norm = (params: any[]) => params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));

export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return B().all(sql, norm(params)) as T[];
}
export function get<T = Row>(sql: string, ...params: any[]): T | undefined {
  return B().all(sql, norm(params))[0] as T | undefined;
}
export function run(sql: string, ...params: any[]): RunResult {
  return B().run(sql, norm(params));
}
export function tx<T>(fn: () => T): T {
  return B().transaction(fn);
}

/** Split a long id list into chunks small enough for one query. */
export function chunks<T>(list: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
