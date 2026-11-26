import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/context";
import { getDb } from "@/server/db/client";
import { badRequest } from "@/server/errors";
import { handle, json, readJson } from "@/server/http";
import { getUser } from "@/server/users";
import { sessionSchema } from "@/server/validation";

/** Switches the acting demo account. This stands in for a real sign in. */
export const POST = handle(async (req: NextRequest) => {
  const { userId } = sessionSchema.parse(await readJson(req));
  const db = await getDb();
  const user = await getUser(db, userId);
  if (!user) throw badRequest("That demo account does not exist.");

  const isHttps =
    req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: user.id,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return json({ user });
});
