import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { createDocument, listDocuments } from "@/server/documents";
import { badRequest } from "@/server/errors";
import { handle, json } from "@/server/http";
import { createDocumentSchema } from "@/server/validation";

export const GET = handle(async () => {
  const { db, user } = await getContext();
  return json(await listDocuments(db, user.id));
});

export const POST = handle(async (req: NextRequest) => {
  const { db, user } = await getContext();

  // A bare POST creates an untitled document, so the body is optional.
  const raw = await req.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      throw badRequest("The request body must be valid JSON.");
    }
  }
  const input = createDocumentSchema.parse(body);
  const document = await createDocument(db, user.id, input);
  return json({ document }, { status: 201 });
});
