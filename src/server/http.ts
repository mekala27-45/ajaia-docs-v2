import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { DatabaseConfigError } from "./db/client";
import { AppError, badRequest } from "./errors";

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** One error shape for every endpoint: { error: { code, message, details? } }. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "The request is not valid.";
    return NextResponse.json({ error: { code: "bad_request", message } }, { status: 400 });
  }
  if (err instanceof DatabaseConfigError) {
    return NextResponse.json(
      { error: { code: "internal", message: err.message } },
      { status: 503 },
    );
  }
  // Unknown failures are logged in full and reported without internals.
  console.error("[api] unexpected error:", err);
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on the server. Please try again." } },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown errors become JSON responses. */
export function handle<Ctx>(
  fn: (req: NextRequest, ctx: Ctx) => Promise<Response>,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("The request body must be valid JSON.");
  }
}
