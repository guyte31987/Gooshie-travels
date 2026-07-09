"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AdminPanel } from "@/components/AdminPanel";

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Admins only.{" "}
        <Link href="/" className="ml-2 underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <Link href="/" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          ← Back to trip
        </Link>
      </header>
      <AdminPanel />
    </div>
  );
}
