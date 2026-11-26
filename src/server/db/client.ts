import path from "node:path";
import { isPostgresUrl, normalizeDatabaseUrl } from "./diagnose";
import { migrate } from "./schema";
import type { Db } from "./types";

/** Raised when the deployment is missing its database settings. */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

type GlobalWithDb = typeof globalThis & { __ajaiaDocsDb?: Promise<Db> };
const globalRef = globalThis as GlobalWithDb;

/** True on platforms where the local disk does not survive, so PGlite must not be used. */
export function isHostedPlatform(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    env.VERCEL || env.RENDER || env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT,
  );
}

async function connect(): Promise<Db> {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  let db: Db;

  if (url) {
    if (!isPostgresUrl(url)) {
      throw new DatabaseConfigError(
        "DATABASE_URL must start with postgresql:// but the current value holds no Postgres address. Copy the connection string from your database console again, save it in the environment variables of this deployment and redeploy.",
      );
    }
    const { createPostgresDb } = await import("./postgres");
    const serverless = Boolean(
      process.env.NETLIFY || process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
    );
    db = createPostgresDb(url, serverless);
  } else if (isHostedPlatform()) {
    // Hosted disks are wiped on every deploy or request, so an embedded
    // database would silently lose documents. Fail loudly instead.
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. Add a Postgres connection string to the environment variables of this deployment and redeploy.",
    );
  } else {
    const { createPgliteDb } = await import("./pglite");
    const dataDir = path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "pglite");
    db = await createPgliteDb(dataDir);
  }

  try {
    await migrate(db);
  } catch (err) {
    await db.close().catch(() => undefined);
    throw err;
  }
  return db;
}

/**
 * One shared connection per server instance. The promise is cached on
 * globalThis so hot reloads in development do not open a second database.
 */
export function getDb(): Promise<Db> {
  if (!globalRef.__ajaiaDocsDb) {
    globalRef.__ajaiaDocsDb = connect().catch((err) => {
      globalRef.__ajaiaDocsDb = undefined; // let the next request try again
      throw err;
    });
  }
  return globalRef.__ajaiaDocsDb;
}
