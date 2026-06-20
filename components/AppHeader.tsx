"use client";

import Link from "next/link";
import { useState } from "react";
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
  const { role, isAdmin, signOut, user, updateDisplayName } = useAuth();
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
        {user && <DisplayNameChip name={user.displayName ?? user.email ?? ""} onSave={updateDisplayName} />}
        <button onClick={signOut} className="text-slate-500 underline-offset-2 hover:underline">
          Sign out
        </button>
      </div>
    </header>
  );
}

function DisplayNameChip({ name, onSave }: { name: string; onSave: (n: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const open = () => { setDraft(name); setEditing(true); };
  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(trimmed); } finally { setBusy(false); setEditing(false); }
  };

  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          disabled={busy}
          className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-xs outline-none focus:border-slate-500"
        />
      </form>
    );
  }

  return (
    <button
      onClick={open}
      title="Click to change your display name"
      className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-200"
    >
      {name}
    </button>
  );
}
