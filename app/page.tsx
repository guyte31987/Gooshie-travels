"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { SignIn } from "@/components/SignIn";
import { Schedule } from "@/components/Schedule";
import { RequestAccess } from "@/components/RequestAccess";

export default function Home() {
  const { user, access, role, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) return <SignIn />;
  if (access === "unregistered") return <RequestAccess />;
  if (access === "pending") return <Gate title="Almost there" email={user.email} onSignOut={signOut}>
    Your request is in. Guy will approve you — check back shortly.
  </Gate>;
  if (access === "denied") return <Gate title="No access" email={user.email} onSignOut={signOut}>
    This account doesn&apos;t have access to the trip.
  </Gate>;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">NYC Pride &amp; Berkshires</h1>
          <p className="text-xs text-slate-500">18–28 June 2026</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-full bg-ink px-2.5 py-1 font-medium text-white hover:bg-ink/90"
            >
              Admin
            </Link>
          )}
          {!isAdmin && role && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600">
              {role}
            </span>
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

function Gate({
  title,
  email,
  children,
  onSignOut,
}: {
  title: string;
  email: string | null;
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">{children}</p>
        <p className="mt-1 text-xs text-slate-400">{email}</p>
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
