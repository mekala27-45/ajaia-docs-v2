import { AppHeader } from "@/components/AppHeader";

/** Shown instead of a page when the database is missing or unreachable. */
export function DatabaseProblem({ message, reason }: { message: string; reason?: string }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-950">The app is not ready yet</h1>
          <p className="mt-2 text-sm text-amber-900">{message}</p>
          {reason && <p className="mt-2 font-mono text-xs text-amber-800">Reason: {reason}</p>}
          <p className="mt-4 text-sm text-amber-900">
            Check{" "}
            <a className="font-medium underline" href="/api/health">
              /api/health
            </a>{" "}
            after fixing the setup.
          </p>
        </div>
      </main>
    </>
  );
}
