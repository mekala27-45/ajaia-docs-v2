"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { flushPendingSaves } from "@/lib/pendingSaves";
import type { User } from "@/server/users";

/**
 * Stand in for sign in. Picks which seeded demo account the browser acts as,
 * so one reviewer can walk through a sharing flow from both sides.
 */
export function UserSwitcher({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = users.find((user) => user.id === currentUserId) ?? users[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function switchTo(userId: string) {
    setOpen(false);
    if (userId === currentUserId) return;
    setError(null);
    try {
      // Store pending edits while the old account is still the acting one.
      await flushPendingSaves();
      await api("/api/session", { json: { userId } });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!current) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in as ${current.name}. Switch account`}
        data-testid="user-switcher"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50",
          isPending && "opacity-60",
        )}
      >
        <Avatar name={current.name} color={current.color} size="sm" />
        <span className="max-w-[9rem] truncate">{current.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch account"
          className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-slate-500">
            Demo accounts. Switch to see the same document as another person.
          </p>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              role="menuitemradio"
              aria-checked={user.id === currentUserId}
              onClick={() => switchTo(user.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100"
            >
              <Avatar name={user.name} color={user.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
              {user.id === currentUserId && <Check className="h-4 w-4 text-blue-600" />}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="absolute right-0 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
