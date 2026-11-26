import type { NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { getDocument } from "@/server/documents";
import { documentToMarkdown, exportFilename } from "@/server/export";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Downloads the document as a Markdown file. Anyone who can read it can export it. */
export const GET = handle<Ctx>(async (_req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const { db, user } = await getContext();
  const document = await getDocument(db, user.id, id);

  return new Response(documentToMarkdown(document.title, document.content), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(document.title)}"`,
      "cache-control": "no-store",
    },
  });
});
