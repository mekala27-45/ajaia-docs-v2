"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-slate-600">
        The page could not be loaded. Your documents are safe. Try again, and if it keeps happening check
        /api/health.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
      >
        Try again
      </button>
    </main>
  );
}
