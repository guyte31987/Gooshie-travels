"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AdminPanel } from "@/components/AdminPanel";
import { SyncReport } from "@/components/SyncReport";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type AdminTab = "access" | "sync";

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>("access");

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

      <nav className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <TabBtn active={tab === "access"} onClick={() => setTab("access")}>
          Access
        </TabBtn>
        <TabBtn active={tab === "sync"} onClick={() => setTab("sync")}>
          Sync &amp; Conflicts
        </TabBtn>
      </nav>

      {tab === "access" ? (
        <AdminPanel />
      ) : (
        <ErrorBoundary label="The Sync report">
          <SyncReport />
        </ErrorBoundary>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
        active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
