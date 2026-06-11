"use client";

import { RequireAccess } from "@/components/RequireAccess";
import { DatabaseView } from "@/components/DatabaseView";
import { TripDataProvider } from "@/components/TripData";
import { TRIPS } from "@/lib/trips";

const trip = TRIPS[0];

export default function DatabasePage() {
  return (
    <RequireAccess need="editor">
      <TripDataProvider tripId={trip.id} tripName={trip.name} tripAreas={trip.areas}>
        <DatabaseView />
      </TripDataProvider>
    </RequireAccess>
  );
}
