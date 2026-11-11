/** The Durable Object's SQLite, behind the synchronous interface the shared code uses. */
import { setBackend, initSchema } from "../server/db.ts";
import { SCHEMA_SQL, LATER_COLUMNS } from "../server/schema.ts";
import { seedDefaults } from "../server/lib/sources.ts";

export function useDurableObjectSql(storage: DurableObjectStorage) {
  const sql = storage.sql;
  const exec = (q: string) => {
    for (const stmt of q
      .split(/;\s*\n/)
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean)) {
      sql.exec(stmt);
    }
  };
  setBackend({
    all: (q, params) => sql.exec(q, ...params).toArray() as any[],
    run: (q, params) => {
      const cur = sql.exec(q, ...params);
      cur.toArray();
      const id = (sql.exec("SELECT last_insert_rowid() AS id").one() as { id: number }).id;
      return { changes: cur.rowsWritten, lastInsertRowid: Number(id) };
    },
    exec,
    transaction: (fn) => storage.transactionSync(fn),
    columns: (table) => {
      try {
        return (sql.exec(`PRAGMA table_info(${table})`).toArray() as { name: string }[]).map((c) => c.name);
      } catch {
        return [];
      }
    },
  });
  initSchema(SCHEMA_SQL, LATER_COLUMNS);
  seedDefaults();
}
