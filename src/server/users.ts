import type { Queryable } from "./db/types";

export type User = {
  id: string;
  name: string;
  email: string;
  color: string;
};

const USER_COLUMNS = `id, name, email, color`;

export async function listUsers(db: Queryable): Promise<User[]> {
  const { rows } = await db.query<User>(
    `SELECT ${USER_COLUMNS} FROM ajaia_docs.users ORDER BY name`,
  );
  return rows;
}

export async function getUser(db: Queryable, id: string): Promise<User | null> {
  const { rows } = await db.query<User>(
    `SELECT ${USER_COLUMNS} FROM ajaia_docs.users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getUserByEmail(db: Queryable, email: string): Promise<User | null> {
  const { rows } = await db.query<User>(
    `SELECT ${USER_COLUMNS} FROM ajaia_docs.users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] ?? null;
}
