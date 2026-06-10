"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { requestAccess } from "@/lib/members";

export function RequestAccess() {
  const { user, signOut, refreshAccess } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setBusy(true);
    setErr(null);
    try {
      await requestAccess(user.email, name);
      await refreshAccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send your request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Request access</h1>
        <p className="mt-2 text-sm text-slate-500">
          You&apos;re signed in as <strong>{user?.email}</strong>. Send a request and Guy will approve
          you.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-slate-400"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Request access"}
          </button>
        </form>
        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        <button
          onClick={signOut}
          className="mt-6 text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
