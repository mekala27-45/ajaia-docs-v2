"use client";

import { FileUp, LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { checkImportFile } from "@/lib/importCheck";
import { IMPORT_ACCEPT, IMPORT_HELP } from "@/lib/limits";

type Created = { document: { id: string } };

/** New document and Import file. Both end in the editor for the new document. */
export function DashboardActions() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"new" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createDocument() {
    setBusy("new");
    setError(null);
    try {
      const { document } = await api<Created>("/api/documents", { method: "POST" });
      router.push(`/d/${document.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again
    if (!file) return;

    const problem = checkImportFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy("import");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { document } = await api<Created>("/api/import", { form });
      router.push(`/d/${document.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={createDocument} disabled={busy !== null} data-testid="new-document">
          {busy === "new" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New document
        </Button>
        <Button onClick={() => fileInput.current?.click()} disabled={busy !== null} data-testid="import-file">
          {busy === "import" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Import file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={IMPORT_ACCEPT}
          onChange={importFile}
          className="sr-only"
          aria-label="Choose a file to import"
          data-testid="import-input"
        />
      </div>
      <p className="text-xs text-slate-500 sm:text-right">
        {IMPORT_HELP}
        <br />
        An imported file becomes a new document that you own.
      </p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
