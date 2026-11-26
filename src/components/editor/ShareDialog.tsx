"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Alert, Avatar, Button } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ShareRole } from "@/lib/limits";
import type { SharingState } from "@/server/shares";

type Props = {
  documentId: string;
  open: boolean;
  onClose: () => void;
};

const ROLE_LABEL: Record<ShareRole, string> = { editor: "Can edit", viewer: "View only" };

function RoleSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: ShareRole;
  onChange: (role: ShareRole) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ShareRole)}
      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
    >
      <option value="editor">{ROLE_LABEL.editor}</option>
      <option value="viewer">{ROLE_LABEL.viewer}</option>
    </select>
  );
}

/**
 * Owner: add people, change roles, revoke access.
 * Everyone else with access: a read only list of who can see the document.
 */
export function ShareDialog({ documentId, open, onClose }: Props) {
  const [sharing, setSharing] = useState<SharingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [pickedRole, setPickedRole] = useState<ShareRole>("editor");
  const sharesPath = `/api/documents/${documentId}/shares`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<{ sharing: SharingState }>(sharesPath)
      .then((result) => {
        if (cancelled) return;
        setSharing(result.sharing);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, sharesPath]);

  async function run(request: () => Promise<{ sharing: SharingState }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      setSharing(result.sharing);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const candidates = sharing?.candidates ?? [];
  const picked = candidates.find((person) => person.id === pickedId) ?? candidates[0];
  const canManage = sharing?.canManage ?? false;

  return (
    <Modal open={open} onClose={onClose} title={canManage ? "Share this document" : "People with access"}>
      {!sharing && !error && <p className="text-sm text-slate-500">Loading...</p>}
      {error && <Alert>{error}</Alert>}

      {sharing && (
        <div className="space-y-5">
          {canManage &&
            (picked ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() =>
                    api(sharesPath, { method: "PUT", json: { userId: picked.id, role: pickedRole } }),
                  );
                }}
              >
                <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                  Add a person
                  <select
                    data-testid="share-person"
                    value={picked.id}
                    onChange={(event) => setPickedId(event.target.value)}
                    className="mt-1 block h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal"
                  >
                    {candidates.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} ({person.email})
                      </option>
                    ))}
                  </select>
                </label>
                <RoleSelect value={pickedRole} onChange={setPickedRole} label="Access for the new person" />
                <Button type="submit" variant="primary" disabled={busy} data-testid="share-submit">
                  Share
                </Button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">Every demo account already has access.</p>
            ))}

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="share-list">
            <li className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={sharing.owner.name} color={sharing.owner.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{sharing.owner.name}</span>
                <span className="block truncate text-xs text-slate-500">{sharing.owner.email}</span>
              </span>
              <span className="text-sm text-slate-500">Owner</span>
            </li>

            {sharing.collaborators.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`share-row-${person.id}`}>
                <Avatar name={person.name} color={person.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.name}</span>
                  <span className="block truncate text-xs text-slate-500">{person.email}</span>
                </span>
                {canManage ? (
                  <>
                    <RoleSelect
                      value={person.role}
                      disabled={busy}
                      label={`Access for ${person.name}`}
                      onChange={(role) =>
                        void run(() => api(sharesPath, { method: "PUT", json: { userId: person.id, role } }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove access for ${person.name}`}
                      title="Remove access"
                      onClick={() => void run(() => api(`${sharesPath}/${person.id}`, { method: "DELETE" }))}
                      className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">{ROLE_LABEL[person.role]}</span>
                )}
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-500">
            Sharing works between the demo accounts in this app. No email is sent. Changes apply right away.
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onClose} data-testid="share-done">
          Done
        </Button>
      </div>
    </Modal>
  );
}
