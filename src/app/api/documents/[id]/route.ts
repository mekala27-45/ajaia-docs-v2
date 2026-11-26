import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { deleteDocument, getDocument, updateDocument } from "@/server/documents";
import { handle, json, readJson } from "@/server/http";
import { updateDocumentSchema } from "@/server/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  const document = await getDocument(db, user.id, id);

  // The editor polls with ?meta=1 to learn about newer versions cheaply.
  if (req.nextUrl.searchParams.get("meta") === "1") {
    const { content: _content, ...meta } = document;
    void _content;
    return json({ document: meta });
  }
  return json({ document });
});

export const PATCH = handle<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  const input = updateDocumentSchema.parse(await readJson(req));
  const document = await updateDocument(db, user.id, id, input);
  // The client already has the content it just sent, so it is not echoed back.
  const { content: _content, ...saved } = document;
  void _content;
  return json({ document: saved });
});

export const DELETE = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  await deleteDocument(db, user.id, id);
  return json({ ok: true });
});
