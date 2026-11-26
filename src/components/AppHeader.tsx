import { FileText } from "lucide-react";
import Link from "next/link";
import { UserSwitcher } from "@/components/UserSwitcher";
import type { User } from "@/server/users";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-slate-900">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white">
        <FileText className="h-4 w-4" />
      </span>
      Ajaia Docs
    </Link>
  );
}

export function AppHeader({ user, users }: { user?: User; users?: User[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Brand />
        {user && users && <UserSwitcher users={users} currentUserId={user.id} />}
      </div>
    </header>
  );
}
