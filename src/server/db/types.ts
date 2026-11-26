export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * The only database surface the app uses. Two adapters implement it:
 * node-postgres for a real Postgres (production) and PGlite, an embedded
 * Postgres, for local runs and tests. Both speak the same SQL.
 */
export interface Db extends Queryable {
  readonly engine: "postgres" | "pglite";
  /** Runs fn inside one transaction and rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
