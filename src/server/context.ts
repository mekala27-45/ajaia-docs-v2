import { cookies } from "next/headers";
import { getDb } from "./db/client";
import { DEFAULT_USER_ID } from "./db/schema";
import type { Db } from "./db/types";
import { AppError } from "./errors";
import { getUser, type User } from "./users";

export const SESSION_COOKIE = "ajaia_docs_uid";

export type RequestContext = { db: Db; user: User };

/**
 * Resolves the database and the acting user for one request.
 *
 * Auth is simulated on purpose (the brief allows it): the cookie only holds
 * the id of a seeded demo account, and a first time visitor acts as Alice.
 * Everything behind this function treats the user as real, so swapping in a
 * real session later changes this file and nothing else.
 */
export async function getContext(): Promise<RequestContext> {
  const db = await getDb();
  const store = await cookies();
  const cookieId = store.get(SESSION_COOKIE)?.value;

  const user =
    (cookieId ? await getUser(db, cookieId) : null) ?? (await getUser(db, DEFAULT_USER_ID));
  if (!user) {
    throw new AppError(401, "unauthenticated", "No demo accounts exist in the database.");
  }
  return { db, user };
}
