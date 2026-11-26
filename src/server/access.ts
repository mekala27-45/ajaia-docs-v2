import type { Access, ShareRole } from "@/lib/limits";

export type { Access, ShareRole };

export const SHARE_ROLES: readonly ShareRole[] = ["viewer", "editor"];

/**
 * The single place that decides what a user is to a document.
 * Returns null when the user has no access at all.
 */
export function resolveAccess(
  userId: string | null | undefined,
  ownerId: string,
  shareRole: ShareRole | null | undefined,
): Access | null {
  if (!userId) return null;
  if (userId === ownerId) return "owner";
  return shareRole ?? null;
}

/** Owners and editors can change the title and the content. */
export function canEdit(access: Access | null): boolean {
  return access === "owner" || access === "editor";
}

/** Only the owner can share, change roles, revoke access or delete. */
export function canManage(access: Access | null): boolean {
  return access === "owner";
}
