import { unstable_rethrow } from "next/navigation";
import { getContext, type RequestContext } from "./context";
import { DatabaseConfigError } from "./db/client";
import { listUsers, type User } from "./users";

export type Shell = RequestContext & { users: User[] };
export type ShellProblem = { problem: string };

/**
 * Everything a page needs before it can render: the database, the acting user
 * and the list of demo accounts for the switcher. A database outage becomes a
 * readable setup screen instead of a blank error page.
 */
export async function loadShell(): Promise<Shell | ShellProblem> {
  try {
    const context = await getContext();
    const users = await listUsers(context.db);
    return { ...context, users };
  } catch (err) {
    unstable_rethrow(err); // let the framework's own control flow errors through
    console.error("[shell] could not load the app shell:", err);
    if (err instanceof DatabaseConfigError) return { problem: err.message };
    return { problem: "The app cannot reach its database right now. Please try again in a moment." };
  }
}
