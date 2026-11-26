import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createDocument, deleteDocument, getDocument, updateDocument } from "@/server/documents";
import { getSharing, shareDocument, unshareDocument } from "@/server/shares";
import { ALICE, BOB, CAROL, createTestDb, expectStatus } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

describe("sharing", () => {
  it("gives a viewer read access only", async () => {
    const doc = await createDocument(db, ALICE, { title: "Read me" });
    await shareDocument(db, ALICE, doc.id, { userId: CAROL, role: "viewer" });

    expect((await getDocument(db, CAROL, doc.id)).access).toBe("viewer");
    await expectStatus(updateDocument(db, CAROL, doc.id, { content: "<p>nope</p>", baseVersion: 1 }), 403);
    await expectStatus(updateDocument(db, CAROL, doc.id, { title: "Renamed" }), 403);
    await expectStatus(deleteDocument(db, CAROL, doc.id), 403);
  });

  it("lets an editor change content and title, but not share or delete", async () => {
    const doc = await createDocument(db, ALICE, { title: "Team draft" });
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });

    const saved = await updateDocument(db, BOB, doc.id, {
      title: "Team draft v2",
      content: "<p>Edited by Bob</p>",
      baseVersion: 1,
    });
    expect(saved).toMatchObject({ title: "Team draft v2", version: 2, updatedByName: "Bob Patel" });

    await expectStatus(shareDocument(db, BOB, doc.id, { userId: CAROL, role: "editor" }), 403);
    await expectStatus(unshareDocument(db, BOB, doc.id, BOB), 403);
    await expectStatus(deleteDocument(db, BOB, doc.id), 403);

    // The owner sees the editor's work.
    expect((await getDocument(db, ALICE, doc.id)).content).toBe("<p>Edited by Bob</p>");
  });

  it("applies a role change on the next request", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });
    await updateDocument(db, BOB, doc.id, { content: "<p>ok</p>", baseVersion: 1 });

    const sharing = await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "viewer" });
    expect(sharing.collaborators).toEqual([expect.objectContaining({ id: BOB, role: "viewer" })]);
    await expectStatus(updateDocument(db, BOB, doc.id, { content: "<p>again</p>", baseVersion: 2 }), 403);
  });

  it("removes all access when the owner revokes a share", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "editor" });
    const sharing = await unshareDocument(db, ALICE, doc.id, BOB);

    expect(sharing.collaborators).toHaveLength(0);
    await expectStatus(getDocument(db, BOB, doc.id), 404);
  });

  it("finds people by email without caring about case", async () => {
    const doc = await createDocument(db, ALICE);
    const sharing = await shareDocument(db, ALICE, doc.id, { email: "  BOB@Example.com ", role: "editor" });
    expect(sharing.collaborators.map((person) => person.id)).toEqual([BOB]);
  });

  it("rejects unknown people and sharing with the owner", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(shareDocument(db, ALICE, doc.id, { email: "nobody@example.com", role: "viewer" }), 400);
    await expectStatus(shareDocument(db, ALICE, doc.id, { userId: "u_missing", role: "viewer" }), 400);
    await expectStatus(shareDocument(db, ALICE, doc.id, { userId: ALICE, role: "editor" }), 400);
  });

  it("does not let a stranger read or change the sharing list", async () => {
    const doc = await createDocument(db, ALICE);
    await expectStatus(getSharing(db, CAROL, doc.id), 404);
    await expectStatus(shareDocument(db, CAROL, doc.id, { userId: CAROL, role: "editor" }), 404);
  });

  it("shows the list to collaborators but offers candidates only to the owner", async () => {
    const doc = await createDocument(db, ALICE);
    await shareDocument(db, ALICE, doc.id, { userId: BOB, role: "viewer" });

    const forOwner = await getSharing(db, ALICE, doc.id);
    expect(forOwner.canManage).toBe(true);
    expect(forOwner.owner.id).toBe(ALICE);
    expect(forOwner.candidates.map((person) => person.id)).toEqual([CAROL]);

    const forViewer = await getSharing(db, BOB, doc.id);
    expect(forViewer.canManage).toBe(false);
    expect(forViewer.collaborators.map((person) => person.id)).toEqual([BOB]);
    expect(forViewer.candidates).toHaveLength(0);
  });
});
