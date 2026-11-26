import type { Queryable } from "./db/types";
import { getDocument, type DocumentDetail } from "./documents";

/** A person counts as present while their last heartbeat is this recent. */
export const PRESENCE_WINDOW_SECONDS = 15;

export type Viewer = { id: string; name: string; color: string };

export type PresenceResult = {
  document: Omit<DocumentDetail, "content">;
  /** Other people who have the document open right now. Never includes the caller. */
  viewers: Viewer[];
};

/**
 * Heartbeat from an open document. Records that the caller is here and
 * answers with the current document state and who else is here. The editor
 * calls this on its regular poll, so presence costs no extra request.
 */
export async function recordPresence(
  db: Queryable,
  userId: string,
  documentId: string,
): Promise<PresenceResult> {
  // Throws 404 for people without access, so they are never recorded.
  const { content: _content, ...document } = await getDocument(db, userId, documentId);
  void _content;

  await db.query(
    `INSERT INTO ajaia_docs.document_presence (document_id, user_id, last_seen)
     VALUES ($1, $2, now())
     ON CONFLICT (document_id, user_id) DO UPDATE SET last_seen = now()`,
    [documentId, userId],
  );

  // Only people who still have access are listed, so someone whose access was
  // just removed disappears at once instead of lingering for a few seconds.
  const { rows: viewers } = await db.query<Viewer>(
    `SELECT u.id, u.name, u.color
       FROM ajaia_docs.document_presence p
       JOIN ajaia_docs.users u ON u.id = p.user_id
       JOIN ajaia_docs.documents d ON d.id = p.document_id
      WHERE p.document_id = $1
        AND p.user_id <> $2
        AND p.last_seen > now() - ($3::int * interval '1 second')
        AND (d.owner_id = p.user_id
             OR EXISTS (SELECT 1
                          FROM ajaia_docs.document_shares s
                         WHERE s.document_id = p.document_id AND s.user_id = p.user_id))
      ORDER BY u.name`,
    [documentId, userId, PRESENCE_WINDOW_SECONDS],
  );

  return { document, viewers };
}

/** Called when a person closes the document, so they disappear right away. */
export async function clearPresence(db: Queryable, userId: string, documentId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return;
  await db.query(
    `DELETE FROM ajaia_docs.document_presence WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId],
  );
}
