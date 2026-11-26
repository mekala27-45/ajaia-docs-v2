import { expect } from "vitest";
import { createPgliteDb } from "@/server/db/pglite";
import { migrate } from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const CAROL = "u_carol";

/** A fresh in-memory Postgres with the real schema and seed data. */
export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db);
  return db;
}

/** Asserts that a service call fails with the given HTTP status. */
export async function expectStatus(promise: Promise<unknown>, status: number): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "AppError", status });
}
