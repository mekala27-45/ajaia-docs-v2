import { Pool } from "pg";
import type { Db, Queryable, Row } from "./types";

/** node-postgres adapter. Works with any Postgres, including Neon and Supabase. */
export function createPostgresDb(connectionString: string): Db {
  const pool = new Pool({
    connectionString,
    // Serverless instances are short lived, so keep the pool small.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // A dropped idle connection must not take the process down.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));

  return {
    engine: "postgres",
    async query<T extends Row = Row>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query<R extends Row = Row>(sql: string, params: unknown[] = []) {
            const result = await client.query(sql, params);
            return { rows: result.rows as R[] };
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
