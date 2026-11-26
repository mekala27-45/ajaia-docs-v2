import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { DatabaseProblem } from "@/components/DatabaseProblem";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { getDocument, type DocumentDetail } from "@/server/documents";
import { AppError } from "@/server/errors";
import { loadShell } from "@/server/shell";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shell = await loadShell();
  if ("problem" in shell) return <DatabaseProblem message={shell.problem} />;

  let document: DocumentDetail;
  try {
    document = await getDocument(shell.db, shell.user.id, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  return (
    <>
      <AppHeader user={shell.user} users={shell.users} />
      {/* The key remounts the editor when the account or the role changes. */}
      <DocumentEditor key={`${document.id}:${shell.user.id}:${document.access}`} initial={document} />
    </>
  );
}
