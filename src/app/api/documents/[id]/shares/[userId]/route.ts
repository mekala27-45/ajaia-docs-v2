import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { handle, json } from "@/server/http";
import { unshareDocument } from "@/server/shares";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Revokes one person's access. */
export const DELETE = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id, userId } = await ctx.params;
  const { db, user } = await getContext();
  return json({ sharing: await unshareDocument(db, user.id, id, userId) });
});
