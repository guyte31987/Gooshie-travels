"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { Schedule } from "./Schedule";
import { PlanningTab } from "./PlanningTab";
import { TripDataProvider } from "./TripData";
import { getTrip } from "@/lib/trips";

const TripMap = dynamic(() => import("./TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="py-12 text-center text-sm text-slate-400">Loading map…</div>,
});

type Tab = "itinerary" | "planning" | "map";

export function TripView({ tripId }: { tripId: string }) {
  const trip = getTrip(tripId);
  const [tab, setTab] = useState<Tab>("itinerary");

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-sm text-slate-400">
        Trip not found.
        <Link href="/" className="underline">
          All trips
        </Link>
      </div>
    );
  }

  return (
    <TripDataProvider tripId={trip.id} tripAreas={trip.areas}>
      <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
        <AppHeader title={trip.name} subtitle={trip.dateLabel} backHref="/" />

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
    </TripDataProvider>
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
