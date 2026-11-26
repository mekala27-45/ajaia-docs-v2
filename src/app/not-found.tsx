import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Document not found</h1>
        <p className="mt-3 text-slate-600">
          This document does not exist, or the account you are using does not have access to it. Go back to your
          documents and switch accounts there if you need to.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Back to documents
        </Link>
      </main>
    </>
  );
}
