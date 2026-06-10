"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { SignIn } from "@/components/SignIn";
import { Schedule } from "@/components/Schedule";
import { PlanningTab } from "@/components/PlanningTab";
import { RequestAccess } from "@/components/RequestAccess";

// Leaflet touches window, so the map is client-only.
const TripMap = dynamic(() => import("@/components/TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="py-12 text-center text-sm text-slate-400">Loading map…</div>,
});

type Tab = "itinerary" | "planning" | "map";

export default function Home() {
  const { user, access, role, isAdmin, loading, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("itinerary");

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

      <nav className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <TabBtn active={tab === "itinerary"} onClick={() => setTab("itinerary")}>
          Itinerary
        </TabBtn>
        <TabBtn active={tab === "planning"} onClick={() => setTab("planning")}>
          Planning
        </TabBtn>
        <TabBtn active={tab === "map"} onClick={() => setTab("map")}>
          Map
        </TabBtn>
      </nav>

      <main>
        {tab === "itinerary" && <Schedule />}
        {tab === "planning" && <PlanningTab />}
        {tab === "map" && <TripMap />}
      </main>
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
