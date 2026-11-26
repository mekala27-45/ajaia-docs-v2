import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, SCHEMA_VERSION } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { createDocument, listDocuments } from "@/server/documents";
import { clearPresence, PRESENCE_WINDOW_SECONDS, recordPresence } from "@/server/presence";
import { shareDocument, unshareDocument } from "@/server/shares";
import { ALICE, BOB, CAROL, createTestDb, expectStatus } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

const ids = (viewers: { id: string }[]) => viewers.map((viewer) => viewer.id);

describe("presence", () => {
  it("shows people who have the document open to each other, never to themselves", async () => {
    const doc = await createDocument(db, ALICE, { title: "Open together" });
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "viewer" });

    const first = await recordPresence(db, ALICE, doc.id);
    expect(first.viewers).toEqual([]);
    expect(first.document).toMatchObject({ id: doc.id, version: 1, access: "owner" });
    expect(first.document).not.toHaveProperty("content");

    const bob = await recordPresence(db, BOB, doc.id);
    expect(ids(bob.viewers)).toEqual([ALICE]);
    expect(bob.document.access).toBe("viewer");

    const alice = await recordPresence(db, ALICE, doc.id);
    expect(alice.viewers).toEqual([{ id: BOB, name: "Bob Patel", color: expect.any(String) }]);
  });

  it("drops people whose last heartbeat is older than the window", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });
    await recordPresence(db, BOB, doc.id);
    await db.query(
      `UPDATE ajaia_docs.document_presence
          SET last_seen = now() - ($3::int * interval '1 second')
        WHERE document_id = $1 AND user_id = $2`,
      [doc.id, BOB, PRESENCE_WINDOW_SECONDS + 5],
    );
    expect((await recordPresence(db, ALICE, doc.id)).viewers).toEqual([]);
  });

  it("removes a person at once when they close the document", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });
    await recordPresence(db, BOB, doc.id);
    await clearPresence(db, BOB, doc.id);
    expect((await recordPresence(db, ALICE, doc.id)).viewers).toEqual([]);
  });

  it("never records or reveals anything to a person without access", async () => {
    const doc = await createDocument(db, ALICE);
    await recordPresence(db, ALICE, doc.id);
    await expectStatus(recordPresence(db, CAROL, doc.id), 404);
    await expectStatus(recordPresence(db, CAROL, "not-a-uuid"), 404);
    const { rows } = await db.query(
      `SELECT 1 FROM ajaia_docs.document_presence WHERE document_id = $1 AND user_id = $2`,
      [doc.id, CAROL],
    );
    expect(rows).toHaveLength(0);
    await clearPresence(db, CAROL, "not-a-uuid"); // must not throw
  });

  it("hides a person as soon as their access is removed", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });
    await recordPresence(db, BOB, doc.id);
    await unshareDocument(db, ALICE, doc.id, BOB);
    expect((await recordPresence(db, ALICE, doc.id)).viewers).toEqual([]);
  });
});

describe("schema upgrade", () => {
  it("adds the presence table to a version 1 database without touching its data", async () => {
    const upgrade = await createTestDb();
    try {
      // Put the database back into the shape version 1 left it in, with a
      // change a re-seed would undo: the starter document is gone.
      await upgrade.query(`DROP TABLE ajaia_docs.document_presence`);
      await upgrade.query(`UPDATE ajaia_docs.app_meta SET value = '1' WHERE key = 'schema_version'`);
      await upgrade.query(`DELETE FROM ajaia_docs.documents WHERE owner_id = $1`, [ALICE]);
      const kept = await createDocument(upgrade, ALICE, { title: "Written before the upgrade" });

      await migrate(upgrade);

      const { rows } = await upgrade.query<{ value: string }>(
        `SELECT value FROM ajaia_docs.app_meta WHERE key = 'schema_version'`,
      );
      expect(rows[0].value).toBe(SCHEMA_VERSION);
      const owned = (await listDocuments(upgrade, ALICE)).owned;
      expect(owned.map((doc) => doc.id)).toEqual([kept.id]); // nothing re-seeded, nothing lost
      expect((await recordPresence(upgrade, ALICE, kept.id)).viewers).toEqual([]);
    } finally {
      await upgrade.close();
    }
  });
});
