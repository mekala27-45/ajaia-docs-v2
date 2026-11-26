import { Pool } from "pg";
import type { Db, Queryable, Row } from "./types";

type PoolSettings = { max: number; idleTimeoutMillis: number };

/**
 * Serverless functions are frozen between requests. A pooled connection that
 * sat through a freeze is usually dead when the function wakes up, so there
 * the pool lets go of idle connections almost at once. A long running server
 * keeps them for reuse.
 */
export function poolSettings(serverless: boolean): PoolSettings {
  return serverless ? { max: 2, idleTimeoutMillis: 500 } : { max: 5, idleTimeoutMillis: 10_000 };
}

const DROPPED_CONNECTION =
  /Connection terminated|ECONNRESET|EPIPE|socket hang up|connection error|Client has encountered/i;

/**
 * A read that failed because its connection was dropped can be repeated
 * safely on a fresh connection. Writes are never repeated automatically.
 */
export function canRetryOnce(sql: string, err: unknown): boolean {
  const isRead = /^\s*select\b/i.test(sql);
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | null)?.code ?? "";
  return isRead && (DROPPED_CONNECTION.test(message) || DROPPED_CONNECTION.test(code));
}

/** node-postgres adapter. Works with any Postgres, including Neon and Supabase. */
export function createPostgresDb(connectionString: string, serverless = false): Db {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ...poolSettings(serverless),
  });
  // A dropped idle connection must not take the process down.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));

  return {
    engine: "postgres",
    async query<T extends Row = Row>(sql: string, params: unknown[] = []) {
      try {
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[] };
      } catch (err) {
        if (!canRetryOnce(sql, err)) throw err;
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[] };
      }
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
