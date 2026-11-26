import Link from "next/link";
import { getContext } from "@/server/context";
import { listDocuments } from "@/server/documents";

export const dynamic = "force-dynamic";

// Temporary plain list. Replaced by the full dashboard in the next commit.
export default async function HomePage() {
  const { db, user } = await getContext();
  const { owned, shared } = await listDocuments(db, user.id);
  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Ajaia Docs</h1>
      <p className="mt-1 text-slate-600">Signed in as {user.name}</p>
      <ul className="mt-6 list-disc pl-6">
        {[...owned, ...shared].map((doc) => (
          <li key={doc.id}>
            <Link href={`/d/${doc.id}`}>{doc.title}</Link> ({doc.access})
          </li>
        ))}
      </ul>
    </main>
  );
}
