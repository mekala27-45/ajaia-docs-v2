import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import {
  describeValueShape,
  diagnoseDatabaseError,
  normalizeDatabaseUrl,
  safeErrorDetail,
} from "@/server/db/diagnose";

export const dynamic = "force-dynamic";

/**
 * Deployment check. Proves the app can reach its database and that the seed
 * ran. When it cannot, it says why in terms an operator can act on, without
 * exposing the connection string.
 */
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
    const diagnosis = diagnoseDatabaseError(err);
    return NextResponse.json(
      {
        ok: false,
        reason: diagnosis.reason,
        hint: diagnosis.hint,
        code: diagnosis.code,
        databaseUrlSet: normalizeDatabaseUrl(process.env.DATABASE_URL) !== null,
        // Only for a rejected value: its shape, never its characters.
        valueShape:
          diagnosis.reason === "invalid_connection_string"
            ? describeValueShape(process.env.DATABASE_URL)
            : undefined,
        detail: safeErrorDetail(err),
      },
      { status: 503 },
    );
  }
}
