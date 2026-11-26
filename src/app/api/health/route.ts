import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

/** Deployment check: proves the app can reach its database and that the seed ran. */
export async function GET() {
  try {
    const db = await getDb();
    const { rows } = await db.query<{ users: number; documents: number }>(
      `SELECT (SELECT count(*)::int FROM ajaia_docs.users) AS users,
              (SELECT count(*)::int FROM ajaia_docs.documents) AS documents`,
    );
    return NextResponse.json({ ok: true, database: db.engine, ...rows[0] });
  } catch (err) {
    console.error("[health] database check failed:", err);
    const message = err instanceof Error && err.name === "DatabaseConfigError" ? err.message : "The database is not reachable.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
