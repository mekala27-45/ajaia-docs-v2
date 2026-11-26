import fs from "node:fs";
import type { Db, Queryable, Row } from "./types";

/**
 * Embedded Postgres. With a dataDir the data is kept on disk, without one it
 * lives in memory (used by the test suite).
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const lite = dataDir ? new PGlite(dataDir) : new PGlite();
  await lite.waitReady;

  return {
    engine: "pglite",
    async query<T extends Row = Row>(sql: string, params: unknown[] = []) {
      const result = await lite.query<T>(sql, params);
      return { rows: result.rows };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const out = await lite.transaction(async (tx) =>
        fn({
          async query<R extends Row = Row>(sql: string, params: unknown[] = []) {
            const result = await tx.query<R>(sql, params);
            return { rows: result.rows };
          },
        }),
      );
      return out as T;
    },
    close: () => lite.close(),
  };
}
