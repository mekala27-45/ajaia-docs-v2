import { FileText, Users } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DashboardActions } from "@/components/DashboardActions";
import { DatabaseProblem } from "@/components/DatabaseProblem";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { AccessBadge } from "@/components/ui";
import { formatRelativeTime } from "@/lib/format";
import { listDocuments, type DocumentSummary } from "@/server/documents";
import { loadShell } from "@/server/shell";

export const dynamic = "force-dynamic";

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const owned = doc.access === "owner";
  const editedBy = doc.updatedByName ? ` by ${doc.updatedByName}` : "";

  return (
    <li className="relative flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50" data-testid="document-row">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
        <FileText className="h-4.5 w-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        {/* The ::after layer makes the whole row clickable. */}
        <Link href={`/d/${doc.id}`} className="font-medium text-slate-900 after:absolute after:inset-0">
          <span className="block truncate">{doc.title}</span>
        </Link>
        <p className="truncate text-sm text-slate-500">{doc.snippet || "Empty document"}</p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {owned ? "" : `Owner: ${doc.ownerName} · `}
          Edited {formatRelativeTime(doc.updatedAt)}
          {editedBy}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {owned && doc.shareCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            title={`Shared with ${doc.shareCount} ${doc.shareCount === 1 ? "person" : "people"}`}
          >
            <Users className="h-3 w-3" />
            {doc.shareCount}
          </span>
        )}
        <AccessBadge access={doc.access} />
        {owned && <DeleteDocumentButton documentId={doc.id} title={doc.title} className="relative z-10" />}
      </div>
    </li>
  );
}

function DocumentSection({
  title,
  empty,
  docs,
  testId,
}: {
  title: string;
  empty: string;
  docs: DocumentSummary[];
  testId: string;
}) {
  return (
    <section className="mt-8" aria-labelledby={`${testId}-heading`} data-testid={testId}>
      <h2 id={`${testId}-heading`} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {title}
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const shell = await loadShell();
  if ("problem" in shell) return <DatabaseProblem message={shell.problem} reason={shell.reason} />;

  const { owned, shared } = await listDocuments(shell.db, shell.user.id);

  return (
    <>
      <AppHeader user={shell.user} users={shell.users} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-slate-600">
              You are working as <span className="font-medium text-slate-900">{shell.user.name}</span>.
            </p>
          </div>
          <DashboardActions />
        </div>

        <DocumentSection
          title="Owned by me"
          empty="You do not own any documents yet. Create one or import a file."
          docs={owned}
          testId="owned-documents"
        />
        <DocumentSection
          title="Shared with me"
          empty="Nothing has been shared with you yet."
          docs={shared}
          testId="shared-documents"
        />
      </main>
    </>
  );
}
