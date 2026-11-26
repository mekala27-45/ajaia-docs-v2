import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { handle, json } from "@/server/http";
import { clearPresence, recordPresence } from "@/server/presence";

type Ctx = { params: Promise<{ id: string }> };

/** Heartbeat from an open document: current version and role, plus who else is here. */
export const POST = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  return json(await recordPresence(db, user.id, id));
});

/** The caller closed the document. */
export const DELETE = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  await clearPresence(db, user.id, id);
  return json({ ok: true });
});
