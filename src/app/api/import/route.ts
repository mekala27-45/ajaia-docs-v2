import type { NextRequest } from "next/server";
import { IMPORT_HELP, MAX_IMPORT_BYTES } from "@/lib/limits";
import { getContext } from "@/server/context";
import { createDocument } from "@/server/documents";
import { badRequest, payloadTooLarge } from "@/server/errors";
import { handle, json } from "@/server/http";
import { convertImport } from "@/server/importers";

/** Turns an uploaded .txt, .md or .docx file into a new document owned by the caller. */
export const POST = handle(async (req: NextRequest) => {
  const { db, user } = await getContext();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Send the file as multipart form data in a field named file.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to import.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw payloadTooLarge(`This file is too large. ${IMPORT_HELP}`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const converted = await convertImport(file.name, bytes);
  const document = await createDocument(db, user.id, {
    title: converted.title,
    content: converted.content,
  });
  return json({ document: { id: document.id, title: document.title }, kind: converted.kind }, { status: 201 });
});
