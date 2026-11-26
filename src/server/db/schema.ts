import type { Db, Queryable } from "./types";

/**
 * Bump this when the DDL below changes. The app compares it with the value
 * stored in the database on cold start and applies the statements when they
 * differ. Every statement is idempotent, so running them twice is safe.
 */
export const SCHEMA_VERSION = "2";

export const DEFAULT_USER_ID = "u_alice";

// All tables live in their own schema so the app can share a database with
// other projects without name clashes.
const DDL: string[] = [
  `CREATE SCHEMA IF NOT EXISTS ajaia_docs`,
  `CREATE TABLE IF NOT EXISTS ajaia_docs.app_meta (
     key   text PRIMARY KEY,
     value text NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS ajaia_docs.users (
     id         text PRIMARY KEY,
     name       text NOT NULL,
     email      text NOT NULL UNIQUE,
     color      text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ajaia_docs.documents (
     id         uuid PRIMARY KEY,
     title      text NOT NULL,
     content    text NOT NULL,
     owner_id   text NOT NULL REFERENCES ajaia_docs.users(id) ON DELETE CASCADE,
     version    integer NOT NULL DEFAULT 1,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     updated_by text REFERENCES ajaia_docs.users(id) ON DELETE SET NULL
   )`,
  `CREATE INDEX IF NOT EXISTS documents_owner_idx
     ON ajaia_docs.documents (owner_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ajaia_docs.document_shares (
     document_id uuid NOT NULL REFERENCES ajaia_docs.documents(id) ON DELETE CASCADE,
     user_id     text NOT NULL REFERENCES ajaia_docs.users(id) ON DELETE CASCADE,
     role        text NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS document_shares_user_idx
     ON ajaia_docs.document_shares (user_id)`,
  // Version 2: who has a document open right now. One row per person and
  // document, refreshed by a heartbeat from the open editor.
  `CREATE TABLE IF NOT EXISTS ajaia_docs.document_presence (
     document_id uuid NOT NULL REFERENCES ajaia_docs.documents(id) ON DELETE CASCADE,
     user_id     text NOT NULL REFERENCES ajaia_docs.users(id) ON DELETE CASCADE,
     last_seen   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (document_id, user_id)
   )`,
];

export const SEED_USERS = [
  { id: "u_alice", name: "Alice Chen", email: "alice@example.com", color: "#2563eb" },
  { id: "u_bob", name: "Bob Patel", email: "bob@example.com", color: "#059669" },
  { id: "u_carol", name: "Carol Reyes", email: "carol@example.com", color: "#c2410c" },
] as const;

const WELCOME_DOC_ID = "00000000-0000-4000-8000-000000000001";
const NOTES_DOC_ID = "00000000-0000-4000-8000-000000000002";

const WELCOME_CONTENT = [
  `<h1>Welcome to Ajaia Docs</h1>`,
  `<p>This is a small collaborative document editor. Everything you see here is saved to a database as you type. Use this page to try the main flows in about three minutes.</p>`,
  `<h2>Try the editor</h2>`,
  `<ul>`,
  `<li><p>Select some text and make it <strong>bold</strong>, <em>italic</em> or <u>underlined</u>.</p></li>`,
  `<li><p>Use the style menu in the toolbar for headings.</p></li>`,
  `<li><p>Watch the status next to the title change from Saving to Saved.</p></li>`,
  `</ul>`,
  `<h2>Try sharing</h2>`,
  `<ol>`,
  `<li><p>You are signed in as Alice, the owner of this document. Open Share to see who has access.</p></li>`,
  `<li><p>Bob can edit this document. Carol can only view it.</p></li>`,
  `<li><p>Use the account menu in the top right corner to switch to Bob or Carol and see the difference.</p></li>`,
  `</ol>`,
  `<h2>Try an import</h2>`,
  `<p>On the Documents page, choose Import file and pick a .txt, .md or .docx file. It becomes a new document that you own and can edit.</p>`,
].join("");

const NOTES_CONTENT = [
  `<h1>Product sync notes</h1>`,
  `<p>Bob owns this document and shared it with Alice as view only. Alice can read it but cannot change it.</p>`,
  `<h2>Decisions</h2>`,
  `<ul>`,
  `<li><p>Ship the document editor to the pilot team first.</p></li>`,
  `<li><p>Keep sharing simple: one owner, plus people who can edit or view.</p></li>`,
  `</ul>`,
  `<h2>Open questions</h2>`,
  `<ol>`,
  `<li><p>Do we need comments before the pilot?</p></li>`,
  `<li><p>Who reviews imported Word files with tables?</p></li>`,
  `</ol>`,
].join("");

async function seed(tx: Queryable): Promise<void> {
  for (const user of SEED_USERS) {
    await tx.query(
      `INSERT INTO ajaia_docs.users (id, name, email, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.name, user.email, user.color],
    );
  }

  const docs = [
    { id: WELCOME_DOC_ID, title: "Welcome to Ajaia Docs", content: WELCOME_CONTENT, owner: "u_alice" },
    { id: NOTES_DOC_ID, title: "Product sync notes", content: NOTES_CONTENT, owner: "u_bob" },
  ];
  for (const doc of docs) {
    await tx.query(
      `INSERT INTO ajaia_docs.documents (id, title, content, owner_id, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (id) DO NOTHING`,
      [doc.id, doc.title, doc.content, doc.owner],
    );
  }

  const shares = [
    { doc: WELCOME_DOC_ID, user: "u_bob", role: "editor" },
    { doc: WELCOME_DOC_ID, user: "u_carol", role: "viewer" },
    { doc: NOTES_DOC_ID, user: "u_alice", role: "viewer" },
  ];
  for (const share of shares) {
    await tx.query(
      `INSERT INTO ajaia_docs.document_shares (document_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, user_id) DO NOTHING`,
      [share.doc, share.user, share.role],
    );
  }
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  // 42P01 undefined_table, 3F000 invalid_schema_name
  return code === "42P01" || code === "3F000";
}

async function readSchemaVersion(db: Queryable): Promise<string | null> {
  try {
    const { rows } = await db.query<{ value: string }>(
      `SELECT value FROM ajaia_docs.app_meta WHERE key = 'schema_version'`,
    );
    return rows[0]?.value ?? null;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

/**
 * Creates the schema and the demo data when the database is empty or behind.
 * Costs one small query when the database is already up to date.
 */
export async function migrate(db: Db): Promise<void> {
  if ((await readSchemaVersion(db)) === SCHEMA_VERSION) return;

  await db.transaction(async (tx) => {
    // Two cold starts can race here. The lock makes the second one wait and
    // then find the work already done.
    await tx.query(`SELECT pg_advisory_xact_lock(724011)`);
    for (const statement of DDL) await tx.query(statement);

    const { rows } = await tx.query<{ value: string }>(
      `SELECT value FROM ajaia_docs.app_meta WHERE key = 'schema_version'`,
    );
    const firstRun = rows.length === 0;
    if (firstRun) await seed(tx);

    await tx.query(
      `INSERT INTO ajaia_docs.app_meta (key, value)
       VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [SCHEMA_VERSION],
    );
  });
}
