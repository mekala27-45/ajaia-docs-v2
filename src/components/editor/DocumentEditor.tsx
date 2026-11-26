"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeleteDocumentButton } from "@/components/DeleteDocumentButton";
import { AccessBadge, Alert, Button } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { Autosaver, type SaveFailure, type SaveSnapshot } from "@/lib/autosave";
import { countWords, formatRelativeTime } from "@/lib/format";
import { MAX_TITLE_LENGTH } from "@/lib/limits";
import { registerFlusher } from "@/lib/pendingSaves";
import type { DocumentDetail } from "@/server/documents";
import { SaveStatus } from "./SaveStatus";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";

/** How often an open document asks the server whether someone else saved. */
const POLL_INTERVAL_MS = 5000;

type DocumentMeta = Omit<DocumentDetail, "content">;

const INITIAL_SNAPSHOT: SaveSnapshot = { state: "saved", message: null, lastSaved: null, conflictBy: null };

function classifySaveError(err: unknown): SaveFailure {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      const by = err.details?.updatedByName;
      return { kind: "conflict", message: err.message, updatedByName: typeof by === "string" ? by : null };
    }
    if (err.status === 403 || err.status === 404) return { kind: "access", message: err.message };
    if (err.status >= 400 && err.status < 500) return { kind: "rejected", message: err.message };
  }
  return { kind: "transient", message: "Could not reach the server." };
}

const htmlToText = (html: string) => html.replace(/<[^>]+>/g, " ");

export function DocumentEditor({ initial }: { initial: DocumentDetail }) {
  const router = useRouter();
  const apiPath = `/api/documents/${initial.id}`;
  const access = initial.access;
  const canEdit = access !== "viewer";
  const isOwner = access === "owner";

  const [title, setTitle] = useState(initial.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SaveSnapshot>(INITIAL_SNAPSHOT);
  const [lastEdit, setLastEdit] = useState({ at: initial.updatedAt, by: initial.updatedByName });
  const [words, setWords] = useState(() => countWords(htmlToText(initial.content)));
  const [notice, setNotice] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const saverRef = useRef<Autosaver | null>(null);
  const loadedVersionRef = useRef(initial.version);
  const savedTitleRef = useRef(initial.title);
  const titleFocusedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Links arrive through imports and paste. In view only mode they open on click.
        link: { openOnClick: !canEdit, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder: canEdit ? "Start writing..." : "This document is empty." }),
    ],
    content: initial.content,
    editable: canEdit,
    // The page is rendered on the server first, so the editor mounts after hydration.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "doc-content", "aria-label": "Document content", "data-testid": "editor" },
    },
    onUpdate: ({ editor: instance }) => {
      setWords(countWords(instance.getText()));
      saverRef.current?.edit(instance.getHTML());
    },
  });

  // Autosave, plus the safety nets around leaving the page.
  useEffect(() => {
    if (!canEdit) return;

    const saver = new Autosaver({
      version: loadedVersionRef.current,
      send: async (content, baseVersion) => {
        const { document: saved } = await api<{ document: DocumentMeta }>(apiPath, {
          method: "PATCH",
          json: { content, baseVersion },
        });
        return { version: saved.version, updatedAt: saved.updatedAt, updatedByName: saved.updatedByName };
      },
      classify: classifySaveError,
      onChange: (next) => {
        setSnapshot(next);
        if (next.state === "saved" && next.lastSaved) {
          setLastEdit({ at: next.lastSaved.updatedAt, by: next.lastSaved.updatedByName });
        }
        if (next.state === "blocked") setAccessLost(true);
      },
    });
    saverRef.current = saver;
    const unregister = registerFlusher(() => saver.flush());

    const sendPending = (keepalive: boolean) => {
      const pending = saver.pendingPayload();
      if (!pending) return;
      void fetch(apiPath, {
        method: "PATCH",
        keepalive,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pending),
      }).catch(() => undefined);
    };
    const onPageHide = () => sendPending(true);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.hasUnsavedWork) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saver.flush();
      }
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown);
      unregister();
      sendPending(false); // leaving through a link inside the app
      saver.dispose();
      saverRef.current = null;
    };
  }, [apiPath, canEdit]);

  /** Replaces the editor content with the server copy. */
  const applyRemote = useCallback(
    (latest: DocumentDetail, announce: boolean) => {
      if (!editor) return;
      editor.commands.setContent(latest.content, { emitUpdate: false });
      loadedVersionRef.current = latest.version;
      saverRef.current?.adoptRemote({
        version: latest.version,
        updatedAt: latest.updatedAt,
        updatedByName: latest.updatedByName,
      });
      setWords(countWords(editor.getText()));
      setLastEdit({ at: latest.updatedAt, by: latest.updatedByName });
      if (latest.title !== savedTitleRef.current && !titleFocusedRef.current) {
        savedTitleRef.current = latest.title;
        setTitle(latest.title);
      }
      if (announce) setNotice(`${latest.updatedByName ?? "Someone"} updated this document.`);
    },
    [editor],
  );

  // Light sync: ask for the version every few seconds and pull newer content
  // when there is nothing unsaved here. This is polling, not real time editing.
  useEffect(() => {
    if (!editor || accessLost) return;
    let cancelled = false;

    const check = async () => {
      if (document.hidden) return;
      const saver = saverRef.current;
      if (saver && (saver.hasUnsavedWork || saver.isStopped)) return;
      try {
        const { document: meta } = await api<{ document: DocumentMeta }>(`${apiPath}?meta=1`);
        if (cancelled) return;
        if (meta.access !== access) {
          router.refresh(); // the role changed, so reload the page in its new mode
          return;
        }
        if (meta.title !== savedTitleRef.current && !titleFocusedRef.current) {
          savedTitleRef.current = meta.title;
          setTitle(meta.title);
        }
        const current = saverRef.current?.currentVersion ?? loadedVersionRef.current;
        if (meta.version <= current) return;

        const { document: latest } = await api<{ document: DocumentDetail }>(apiPath);
        if (cancelled) return;
        const active = saverRef.current;
        if (active && (active.hasUnsavedWork || active.isStopped)) return; // typing started meanwhile
        applyRemote(latest, true);
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 404) setAccessLost(true);
      }
    };

    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [editor, accessLost, apiPath, access, applyRemote, router]);

  useEffect(() => {
    if (editor && accessLost) editor.setEditable(false);
  }, [editor, accessLost]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = `${title.trim() || "Untitled document"} · Ajaia Docs`;
  }, [title]);

  async function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim();
    if (!next) {
      setTitle(savedTitleRef.current);
      setTitleError("The title cannot be empty. The previous title was kept.");
      return;
    }
    setTitle(next);
    if (next === savedTitleRef.current) return;
    try {
      const { document: saved } = await api<{ document: DocumentMeta }>(apiPath, {
        method: "PATCH",
        json: { title: next },
      });
      savedTitleRef.current = saved.title;
      setTitle(saved.title);
      setLastEdit({ at: saved.updatedAt, by: saved.updatedByName });
    } catch (err) {
      setTitleError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setAccessLost(true);
    }
  }

  async function loadLatest() {
    setResolving(true);
    try {
      const { document: latest } = await api<{ document: DocumentDetail }>(apiPath);
      applyRemote(latest, false);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setResolving(false);
    }
  }

  async function keepMine() {
    setResolving(true);
    try {
      const { document: meta } = await api<{ document: DocumentMeta }>(`${apiPath}?meta=1`);
      await saverRef.current?.overwrite(meta.version);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setResolving(false);
    }
  }

  const editedBy = lastEdit.by ? ` by ${lastEdit.by}` : "";

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          <Link
            href="/"
            aria-label="Back to documents"
            title="Back to documents"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <input
            value={title}
            readOnly={!canEdit || accessLost}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="Document title"
            data-testid="title-input"
            placeholder="Untitled document"
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(null);
            }}
            onFocus={() => {
              titleFocusedRef.current = true;
            }}
            onBlur={() => {
              titleFocusedRef.current = false;
              if (canEdit && !accessLost) void commitTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(savedTitleRef.current);
                event.currentTarget.blur();
              }
            }}
            className="min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-blue-500 focus:outline-none read-only:hover:border-transparent"
          />

          <AccessBadge access={access} />
          {canEdit && <SaveStatus snapshot={snapshot} />}
          <Button
            variant={isOwner ? "primary" : "secondary"}
            onClick={() => setShareOpen(true)}
            data-testid="share-button"
          >
            <Users className="h-4 w-4" />
            {isOwner ? "Share" : "People"}
          </Button>
          {isOwner && <DeleteDocumentButton documentId={initial.id} title={title} redirectTo="/" />}
        </div>
        {canEdit && !accessLost && editor && <Toolbar editor={editor} />}
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="space-y-2 empty:hidden">
          {!canEdit && (
            <Alert tone="info">
              You have view only access. Ask {initial.ownerName}, the owner, if you need to edit.
            </Alert>
          )}
          {accessLost && (
            <Alert>
              You no longer have access to this document, so changes cannot be saved.{" "}
              <Link href="/" className="font-medium underline">
                Back to documents
              </Link>
            </Alert>
          )}
          {snapshot.state === "conflict" && !accessLost && (
            <Alert tone="warning">
              <p>
                {snapshot.conflictBy ?? "Someone"} saved a newer version while you were editing. Your changes are
                still on this screen but are not saved.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={loadLatest} disabled={resolving} data-testid="conflict-load-latest">
                  Load the latest version
                </Button>
                <Button onClick={keepMine} disabled={resolving} data-testid="conflict-keep-mine">
                  Keep my version
                </Button>
              </div>
            </Alert>
          )}
          {snapshot.state === "error" && snapshot.message && <Alert>{snapshot.message}</Alert>}
          {titleError && <Alert>{titleError}</Alert>}
          {notice && <Alert tone="info">{notice}</Alert>}
        </div>

        <div
          className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-14 sm:py-12"
          onMouseDown={(event) => {
            // A click on the empty part of the page puts the cursor in the document.
            if (event.target === event.currentTarget && canEdit) {
              event.preventDefault();
              editor?.chain().focus("end").run();
            }
          }}
        >
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            // Content is sanitized on every write, so the stored HTML is safe to
            // show directly while the editor loads.
            <div className="doc-content" dangerouslySetInnerHTML={{ __html: initial.content }} />
          )}
        </div>

        <p className="mt-3 px-1 text-xs text-slate-500" data-testid="document-footer">
          {words} {words === 1 ? "word" : "words"} · Last edited {formatRelativeTime(lastEdit.at, now)}
          {editedBy}
        </p>
      </main>

      <ShareDialog documentId={initial.id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
