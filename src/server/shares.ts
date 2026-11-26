import { canManage, type ShareRole } from "./access";
import type { Queryable } from "./db/types";
import { getDocument } from "./documents";
import { badRequest, forbidden } from "./errors";
import { getUser, getUserByEmail, type User } from "./users";

export type Collaborator = User & { role: ShareRole };

export type SharingState = {
  owner: User;
  collaborators: Collaborator[];
  /** People the owner could still add. Empty for everyone except the owner. */
  candidates: User[];
  canManage: boolean;
};

type CollaboratorRow = User & { role: ShareRole };

/** Who has access to a document. Anyone with access may see the list. */
export async function getSharing(db: Queryable, userId: string, documentId: string): Promise<SharingState> {
  const document = await getDocument(db, userId, documentId);
  const manage = canManage(document.access);

  const owner = await getUser(db, document.ownerId);
  if (!owner) throw badRequest("The owner of this document no longer exists.");

  const { rows: collaborators } = await db.query<CollaboratorRow>(
    `SELECT u.id, u.name, u.email, u.color, s.role
       FROM ajaia_docs.document_shares s
       JOIN ajaia_docs.users u ON u.id = s.user_id
      WHERE s.document_id = $1
      ORDER BY u.name`,
    [documentId],
  );

  let candidates: User[] = [];
  if (manage) {
    const { rows } = await db.query<User>(
      `SELECT u.id, u.name, u.email, u.color
         FROM ajaia_docs.users u
        WHERE u.id <> $2
          AND NOT EXISTS (SELECT 1
                            FROM ajaia_docs.document_shares s
                           WHERE s.document_id = $1 AND s.user_id = u.id)
        ORDER BY u.name`,
      [documentId, document.ownerId],
    );
    candidates = rows;
  }

  return { owner, collaborators, candidates, canManage: manage };
}

async function requireOwner(db: Queryable, userId: string, documentId: string) {
  const document = await getDocument(db, userId, documentId);
  if (!canManage(document.access)) {
    throw forbidden("Only the owner can change who has access to this document.");
  }
  return document;
}

/** Grants access, or changes the role when the person already has access. */
export async function shareDocument(
  db: Queryable,
  userId: string,
  documentId: string,
  input: { userId?: string; email?: string; role: ShareRole },
): Promise<SharingState> {
  const document = await requireOwner(db, userId, documentId);

  const target = input.userId
    ? await getUser(db, input.userId)
    : input.email
      ? await getUserByEmail(db, input.email)
      : null;
  if (!target) {
    throw badRequest("No account matches that person. Sharing works with the demo accounts in this app.");
  }
  if (target.id === document.ownerId) {
    throw badRequest("The owner already has full access to this document.");
  }

  await db.query(
    `INSERT INTO ajaia_docs.document_shares (document_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [documentId, target.id, input.role],
  );
  return getSharing(db, userId, documentId);
}

/** Revokes access. Removing someone who has no access is a no-op. */
export async function unshareDocument(
  db: Queryable,
  userId: string,
  documentId: string,
  targetUserId: string,
): Promise<SharingState> {
  await requireOwner(db, userId, documentId);
  await db.query(
    `DELETE FROM ajaia_docs.document_shares WHERE document_id = $1 AND user_id = $2`,
    [documentId, targetUserId],
  );
  return getSharing(db, userId, documentId);
}
