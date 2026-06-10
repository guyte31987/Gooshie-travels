"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

/** Shared top bar: title/back, role/admin chips, Database + Sign out links. */
export function AppHeader({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  const { role, isAdmin, signOut } = useAuth();
  const canEdit = isAdmin || role === "editor";

  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="text-xs text-slate-500 underline-offset-2 hover:underline">
            ← All trips
          </Link>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        {canEdit && (
          <Link
            href="/database"
            className="rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-300"
          >
            Database
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-full bg-ink px-2.5 py-1 font-medium text-white hover:bg-ink/90"
          >
            Admin
          </Link>
        )}
        <button onClick={signOut} className="text-slate-500 underline-offset-2 hover:underline">
          Sign out
        </button>
      </div>
    </header>
  );
}
