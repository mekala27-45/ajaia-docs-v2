import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { handle, json, readJson } from "@/server/http";
import { getSharing, shareDocument } from "@/server/shares";
import { shareSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  return json({ sharing: await getSharing(db, user.id, id) });
});

/** Grants access or changes a role. Safe to repeat. */
export const PUT = handle<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  const input = shareSchema.parse(await readJson(req));
  return json({ sharing: await shareDocument(db, user.id, id, input) });
});
