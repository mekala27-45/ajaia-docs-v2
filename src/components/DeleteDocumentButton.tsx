"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Alert, Button, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Props = {
  documentId: string;
  title: string;
  /** Where to go after the delete. Stays on the page and refreshes when omitted. */
  redirectTo?: string;
  className?: string;
};

/** Owner only. Asks before deleting because there is no undo. */
export function DeleteDocumentButton({ documentId, title, redirectTo, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/documents/${documentId}`, { method: "DELETE" });
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${title}`}
        title="Delete document"
        className={cx(
          "grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600",
          className,
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete this document?">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{title}</span> will be removed for you and for everyone it
          is shared with. This cannot be undone.
        </p>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy} data-testid="confirm-delete">
            {busy ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
