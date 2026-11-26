import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, SEED_USERS } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "@/server/documents";
import { shareDocument } from "@/server/shares";
import { listUsers } from "@/server/users";
import { ALICE, BOB, CAROL, createTestDb, expectStatus } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

describe("schema and seed", () => {
  it("creates the demo accounts and starter documents", async () => {
    const users = await listUsers(db);
    expect(users.map((user) => user.id).sort()).toEqual(SEED_USERS.map((user) => user.id).sort());

    const alice = await listDocuments(db, ALICE);
    expect(alice.owned.map((doc) => doc.title)).toContain("Welcome to Ajaia Docs");
    expect(alice.shared.map((doc) => doc.title)).toContain("Product sync notes");
  });

  it("can run the migration again without changing anything", async () => {
    const before = await listDocuments(db, ALICE);
    await migrate(db);
    await migrate(db);
    const after = await listDocuments(db, ALICE);
    expect(after.owned).toHaveLength(before.owned.length);
    expect(await listUsers(db)).toHaveLength(SEED_USERS.length);
  });
});

describe("creating and editing", () => {
  it("creates an untitled empty document owned by the caller", async () => {
    const doc = await createDocument(db, ALICE);
    expect(doc.title).toBe("Untitled document");
    expect(doc.content).toBe("<p></p>");
    expect(doc.version).toBe(1);
    expect(doc.access).toBe("owner");
    expect(doc.ownerId).toBe(ALICE);
  });

  it("saves content, keeps formatting after a reload and bumps the version", async () => {
    const doc = await createDocument(db, ALICE, { title: "Formatting" });
    const content =
      "<h2>Heading</h2><p><strong>bold</strong> <em>italic</em> <u>underline</u></p><ol><li><p>one</p></li></ol>";

    const saved = await updateDocument(db, ALICE, doc.id, { content, baseVersion: doc.version });
    expect(saved.version).toBe(2);

    const reloaded = await getDocument(db, ALICE, doc.id);
    expect(reloaded.content).toBe(content);
    expect(reloaded.updatedByName).toBe("Alice Chen");
  });

  it("sanitizes content on save", async () => {
    const doc = await createDocument(db, ALICE);
    const saved = await updateDocument(db, ALICE, doc.id, {
      content: '<p onclick="x()">safe</p><script>alert(1)</script>',
      baseVersion: 1,
    });
    expect(saved.content).toBe("<p>safe</p>");
  });

  it("rejects a stale save with 409 and keeps the newer content", async () => {
    const doc = await createDocument(db, ALICE);
    await updateDocument(db, ALICE, doc.id, { content: "<p>first</p>", baseVersion: 1 });

    // A second tab still holds version 1.
    await expect(
      updateDocument(db, ALICE, doc.id, { content: "<p>stale</p>", baseVersion: 1 }),
    ).rejects.toMatchObject({ status: 409, details: { currentVersion: 2 } });

    expect((await getDocument(db, ALICE, doc.id)).content).toBe("<p>first</p>");
  });

  it("lets only one of two simultaneous saves win", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });

    const results = await Promise.allSettled([
      updateDocument(db, ALICE, doc.id, { content: "<p>from alice</p>", baseVersion: 1 }),
      updateDocument(db, BOB, doc.id, { content: "<p>from bob</p>", baseVersion: 1 }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect((await getDocument(db, ALICE, doc.id)).version).toBe(2);
  });

  it("requires baseVersion when content is sent", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(updateDocument(db, ALICE, doc.id, { content: "<p>x</p>" }), 400);
  });

  it("does not create a new version when nothing changed", async () => {
    const doc = await createDocument(db, ALICE);
    const first = await updateDocument(db, ALICE, doc.id, { content: "<p>same</p>", baseVersion: 1 });
    const second = await updateDocument(db, ALICE, doc.id, { content: "<p>same</p>", baseVersion: first.version });
    expect(second.version).toBe(first.version);
  });

  it("renames without touching the content version", async () => {
    const doc = await createDocument(db, ALICE);
    const renamed = await updateDocument(db, ALICE, doc.id, { title: "  Roadmap   2027 " });
    expect(renamed.title).toBe("Roadmap 2027");
    expect(renamed.version).toBe(doc.version);
  });

  it("rejects an empty title", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(updateDocument(db, ALICE, doc.id, { title: "   " }), 400);
  });
});

describe("access", () => {
  it("answers 404 for a document the user cannot see", async () => {
    const doc = await createDocument(db, ALICE, { title: "Private" });
    await expectStatus(getDocument(db, CAROL, doc.id), 404);
    await expectStatus(updateDocument(db, CAROL, doc.id, { title: "Hacked" }), 404);
    await expectStatus(deleteDocument(db, CAROL, doc.id), 404);
  });

  it("answers 404 for unknown and malformed ids", async () => {
    await expectStatus(getDocument(db, ALICE, "8b0f4d1e-3c7a-4a52-9d55-0c1f6f0e9a11"), 404);
    await expectStatus(getDocument(db, ALICE, "not-a-uuid"), 404);
    await expectStatus(getDocument(db, ALICE, "1; DROP TABLE users"), 404);
  });

  it("lists owned and shared documents separately with the right role", async () => {
    const doc = await createDocument(db, ALICE, { title: "Shared plan" });
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "viewer" });

    const alice = await listDocuments(db, ALICE);
    const owned = alice.owned.find((item) => item.id === doc.id);
    expect(owned).toMatchObject({ access: "owner", shareCount: 1 });
    expect(alice.shared.some((item) => item.id === doc.id)).toBe(false);

    const bob = await listDocuments(db, BOB);
    const shared = bob.shared.find((item) => item.id === doc.id);
    expect(shared).toMatchObject({ access: "viewer", ownerName: "Alice Chen" });
    expect(bob.owned.some((item) => item.id === doc.id)).toBe(false);

    const carol = await listDocuments(db, CAROL);
    expect([...carol.owned, ...carol.shared].some((item) => item.id === doc.id)).toBe(false);
  });
});

describe("deleting", () => {
  it("lets the owner delete and removes the document for collaborators too", async () => {
    const doc = await createDocument(db, ALICE, { title: "Temporary" });
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });

    await expectStatus(deleteDocument(db, BOB, doc.id), 403);
    await deleteDocument(db, ALICE, doc.id);

    await expectStatus(getDocument(db, ALICE, doc.id), 404);
    await expectStatus(getDocument(db, BOB, doc.id), 404);
    const { rows } = await db.query(
      `SELECT 1 FROM ajaia_docs.document_shares WHERE document_id = $1`,
      [doc.id],
    );
    expect(rows).toHaveLength(0);
  });
});
