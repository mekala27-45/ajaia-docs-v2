import { randomUUID } from "node:crypto";
import { canEdit, canManage, resolveAccess, type Access, type ShareRole } from "./access";
import { EMPTY_DOCUMENT, normalizeTitle, sanitizeContent, titleOrDefault, toSnippet } from "./content";
import type { Queryable } from "./db/types";
import { badRequest, conflict, forbidden, notFound } from "./errors";

export type DocumentDetail = {
  id: string;
  title: string;
  content: string;
  /** Content revision. Goes up by one on every content save. */
  version: number;
  ownerId: string;
  ownerName: string;
  access: Access;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
};

export type DocumentSummary = {
  id: string;
  title: string;
  snippet: string;
  ownerId: string;
  ownerName: string;
  access: Access;
  updatedAt: string;
  updatedByName: string | null;
  /** Number of people the document is shared with. */
  shareCount: number;
};

export type DocumentLists = { owned: DocumentSummary[]; shared: DocumentSummary[] };

type DocumentRow = {
  id: string;
  title: string;
  content: string;
  version: number;
  owner_id: string;
  owner_name: string;
  created_at: Date | string;
  updated_at: Date | string;
  updated_by_name: string | null;
  share_role: ShareRole | null;
};

type SummaryRow = Omit<DocumentRow, "content" | "version" | "created_at"> & {
  content_head: string;
  share_count: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toIso = (value: Date | string) => new Date(value).toISOString();

// A missing document and a document the user cannot see give the same answer,
// so the API never confirms that a private document exists.
const documentNotFound = () =>
  notFound("This document does not exist or you do not have access to it.");

const DOCUMENT_QUERY = `
  SELECT d.id, d.title, d.content, d.version, d.owner_id, d.created_at, d.updated_at,
         o.name AS owner_name, ub.name AS updated_by_name, s.role AS share_role
    FROM ajaia_docs.documents d
    JOIN ajaia_docs.users o ON o.id = d.owner_id
    LEFT JOIN ajaia_docs.users ub ON ub.id = d.updated_by
    LEFT JOIN ajaia_docs.document_shares s ON s.document_id = d.id AND s.user_id = $2
   WHERE d.id = $1`;

function toDetail(row: DocumentRow, access: Access): DocumentDetail {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    version: row.version,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    access,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    updatedByName: row.updated_by_name,
  };
}

/** Loads a document for a user, or throws 404 when they have no access. */
export async function getDocument(db: Queryable, userId: string, id: string): Promise<DocumentDetail> {
  if (!UUID_PATTERN.test(id)) throw documentNotFound();
  const { rows } = await db.query<DocumentRow>(DOCUMENT_QUERY, [id, userId]);
  const row = rows[0];
  const access = row ? resolveAccess(userId, row.owner_id, row.share_role) : null;
  if (!row || !access) throw documentNotFound();
  return toDetail(row, access);
}

/** Documents the user owns and documents shared with them, newest first. */
export async function listDocuments(db: Queryable, userId: string): Promise<DocumentLists> {
  const { rows } = await db.query<SummaryRow>(
    `SELECT d.id, d.title, left(d.content, 4000) AS content_head, d.owner_id, d.updated_at,
            o.name AS owner_name, ub.name AS updated_by_name, s.role AS share_role,
            (SELECT count(*)::int
               FROM ajaia_docs.document_shares x
              WHERE x.document_id = d.id) AS share_count
       FROM ajaia_docs.documents d
       JOIN ajaia_docs.users o ON o.id = d.owner_id
       LEFT JOIN ajaia_docs.users ub ON ub.id = d.updated_by
       LEFT JOIN ajaia_docs.document_shares s ON s.document_id = d.id AND s.user_id = $1
      WHERE d.owner_id = $1 OR s.user_id = $1
      ORDER BY d.updated_at DESC, d.id`,
    [userId],
  );

  const lists: DocumentLists = { owned: [], shared: [] };
  for (const row of rows) {
    const access = resolveAccess(userId, row.owner_id, row.share_role);
    if (!access) continue;
    const summary: DocumentSummary = {
      id: row.id,
      title: row.title,
      snippet: toSnippet(row.content_head),
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      access,
      updatedAt: toIso(row.updated_at),
      updatedByName: row.updated_by_name,
      shareCount: row.share_count,
    };
    (access === "owner" ? lists.owned : lists.shared).push(summary);
  }
  return lists;
}

export async function createDocument(
  db: Queryable,
  userId: string,
  input: { title?: string; content?: string } = {},
): Promise<DocumentDetail> {
  const id = randomUUID();
  const title = titleOrDefault(input.title);
  const content = input.content === undefined ? EMPTY_DOCUMENT : sanitizeContent(input.content);
  await db.query(
    `INSERT INTO ajaia_docs.documents (id, title, content, owner_id, updated_by)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, title, content, userId],
  );
  return getDocument(db, userId, id);
}

export type UpdateDocumentInput = {
  title?: string;
  content?: string;
  /** The version the client last loaded or saved. Required with content. */
  baseVersion?: number;
};

function versionConflict(current: DocumentDetail) {
  const who = current.updatedByName ?? "Someone";
  return conflict(`${who} saved a newer version of this document.`, {
    currentVersion: current.version,
    updatedByName: current.updatedByName,
    updatedAt: current.updatedAt,
  });
}

/**
 * Renames a document, saves its content, or both.
 *
 * Content saves use optimistic concurrency: the write only goes through when
 * the stored version still equals baseVersion. A stale save gets a 409 and
 * never overwrites newer work without the user choosing to.
 */
export async function updateDocument(
  db: Queryable,
  userId: string,
  id: string,
  input: UpdateDocumentInput,
): Promise<DocumentDetail> {
  const current = await getDocument(db, userId, id);
  if (!canEdit(current.access)) {
    throw forbidden("You have view only access to this document.");
  }

  let title: string | undefined;
  if (input.title !== undefined) {
    title = normalizeTitle(input.title);
    if (!title) throw badRequest("The title cannot be empty.");
  }

  if (input.content === undefined) {
    if (title === undefined || title === current.title) return current;
    await db.query(
      `UPDATE ajaia_docs.documents
          SET title = $2, updated_at = now(), updated_by = $3
        WHERE id = $1`,
      [id, title, userId],
    );
    return getDocument(db, userId, id);
  }

  if (input.baseVersion === undefined) {
    throw badRequest("baseVersion is required when saving content.");
  }
  const content = sanitizeContent(input.content);
  if (input.baseVersion !== current.version) throw versionConflict(current);

  const titleChanged = title !== undefined && title !== current.title;
  if (content === current.content && !titleChanged) return current;

  // The version check is repeated inside the UPDATE so that two saves racing
  // between the read above and this write cannot both win.
  const { rows } = await db.query<{ version: number }>(
    `UPDATE ajaia_docs.documents
        SET content = $2,
            title = COALESCE($3, title),
            version = version + 1,
            updated_at = now(),
            updated_by = $4
      WHERE id = $1 AND version = $5
  RETURNING version`,
    [id, content, title ?? null, userId, input.baseVersion],
  );
  if (rows.length === 0) throw versionConflict(await getDocument(db, userId, id));
  return getDocument(db, userId, id);
}

export async function deleteDocument(db: Queryable, userId: string, id: string): Promise<void> {
  const current = await getDocument(db, userId, id);
  if (!canManage(current.access)) {
    throw forbidden("Only the owner can delete this document.");
  }
  // Shares are removed by the ON DELETE CASCADE on document_shares.
  await db.query(`DELETE FROM ajaia_docs.documents WHERE id = $1`, [id]);
}
