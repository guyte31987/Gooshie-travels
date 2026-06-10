"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { SignIn } from "./SignIn";
import { RequestAccess } from "./RequestAccess";

/**
 * Wraps any page with the auth/approval gating. `need` optionally requires an
 * elevated role (the Database is editor+; the admin pages are admin-only).
 */
export function RequireAccess({
  children,
  need,
}: {
  children: React.ReactNode;
  need?: "editor" | "admin";
}) {
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
  if (access === "pending")
    return (
      <Gate title="Almost there" email={user.email} onSignOut={signOut}>
        Your request is in. Guy will approve you — check back shortly.
      </Gate>
    );
  if (access === "denied")
    return (
      <Gate title="No access" email={user.email} onSignOut={signOut}>
        This account doesn&apos;t have access.
      </Gate>
    );

  const canEdit = isAdmin || role === "editor";
  if (need === "admin" && !isAdmin)
    return <Denied>Admins only.</Denied>;
  if (need === "editor" && !canEdit)
    return <Denied>Editors and admins only.</Denied>;

  return <>{children}</>;
}

function Denied({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm text-slate-400">
      {children}
      <Link href="/" className="ml-2 underline">
        Back
      </Link>
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
