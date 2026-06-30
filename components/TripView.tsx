"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { ItineraryBoard } from "./ItineraryBoard";
import { PlanningTab } from "./PlanningTab";
import { RecapBuilder } from "./RecapBuilder";
import { TripDataProvider } from "./TripData";
import { useAuth } from "./AuthProvider";
import { getTrip } from "@/lib/trips";

// Leaflet touches `window`, so the map is client-only (no SSR).
const TripMap = dynamic(() => import("./TripMap").then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="h-[70vh] animate-pulse rounded-xl bg-slate-100" />,
});

type Tab = "itinerary" | "planning" | "map" | "recap";

export function TripView({ tripId }: { tripId: string }) {
  const trip = getTrip(tripId);
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
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
    <TripDataProvider tripId={trip.id} tripName={trip.name} tripAreas={trip.areas}>
      <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
        <AppHeader title={trip.name} backHref="/" />

        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{trip.dateLabel}</p>
          <nav className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs">
            <TabBtn active={tab === "itinerary"} onClick={() => setTab("itinerary")}>
              Itinerary
            </TabBtn>
            <TabBtn active={tab === "planning"} onClick={() => setTab("planning")}>
              Trip DB
            </TabBtn>
            <TabBtn active={tab === "map"} onClick={() => setTab("map")}>
              Map
            </TabBtn>
            {canEdit && (
              <TabBtn active={tab === "recap"} onClick={() => setTab("recap")}>
                Recap
              </TabBtn>
            )}
          </nav>
        </div>

        <main>
          {tab === "itinerary" && <ItineraryBoard tripId={trip.id} />}
          {tab === "planning" && <PlanningTab />}
          {tab === "map" && <TripMap />}
          {tab === "recap" && (
            <RecapBuilder tripId={trip.id} tripName={trip.name} dateLabel={trip.dateLabel} />
          )}
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
      className={`rounded-md px-2.5 py-1 font-medium transition ${
        active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
