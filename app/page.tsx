"use client";

import { useAuth } from "@/components/AuthProvider";
import { SignIn } from "@/components/SignIn";
import { Schedule } from "@/components/Schedule";

export default function Home() {
  const { user, access, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) return <SignIn />;

  if (access === "pending") return <Pending email={user.email} onSignOut={signOut} />;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">NYC Pride &amp; Berkshires</h1>
          <p className="text-xs text-slate-500">18–28 June 2026</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {access === "admin" && (
            <span className="rounded-full bg-ink px-2 py-0.5 font-medium text-white">Admin</span>
          )}
          <button onClick={signOut} className="text-slate-500 underline-offset-2 hover:underline">
            Sign out
          </button>
        </div>
      </header>

      <main>
        <Schedule />
      </main>
    </div>
  );
}

function Pending({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold">Almost there</h1>
        <p className="mt-3 text-sm text-slate-500">
          You&apos;re signed in as <strong>{email}</strong>, but this address hasn&apos;t been added to
          a trip yet. Ask Guy to invite you, then refresh.
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
