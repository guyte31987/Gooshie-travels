// Trip catalog. Backed by the Firestore `trips` collection (see lib/db.ts) so
// trips can be created in-app via the admin panel. NYC_SEED is the original
// trip's metadata, used as a one-time fallback if Firestore has no trips yet
// (e.g. a fresh environment before the collection has been seeded).

import { useEffect, useState } from "react";
import { subscribeTrips, type Trip } from "./db";

export type TripMeta = {
  id: string;
  name: string;
  dateLabel: string;
  /** Trip span (YYYY-MM-DD) — drives the itinerary grid's day columns. */
  startDate: string;
  endDate: string;
  /** General areas this trip covers — seeds which entities its Planning includes. */
  areas: string[];
};

const NYC_SEED: TripMeta = {
  id: "nyc-2026",
  name: "NYC Pride & Berkshires",
  dateLabel: "18–28 June 2026",
  startDate: "2026-06-18",
  endDate: "2026-06-28",
  areas: ["New York City", "Upstate New York", "Berkshires (Western MA)", "Pennsylvania"],
};

function toTripMeta(t: Trip): TripMeta {
  return {
    id: t.id,
    name: t.name,
    dateLabel: t.dateLabel ?? "",
    startDate: t.startDate ?? "",
    endDate: t.endDate ?? "",
    areas: t.areas ?? [],
  };
}

/** Live-subscribes to the trip catalog. Falls back to the NYC seed trip if Firestore has none yet. */
export function useTrips(): TripMeta[] {
  const [trips, setTrips] = useState<TripMeta[]>([NYC_SEED]);

  useEffect(() => {
    return subscribeTrips((rows) => {
      setTrips(rows.length > 0 ? rows.map(toTripMeta) : [NYC_SEED]);
    });
  }, []);

  return trips;
}

/** Inclusive list of YYYY-MM-DD days a trip spans. Empty if the trip has no valid start/end date. */
export function tripDays(t: TripMeta): string[] {
  const out: string[] = [];
  const [y, m, d] = t.startDate.split("-").map(Number);
  const end = t.endDate;
  const start = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(start.getTime()) || !end) return out;
  for (let dt = start; ; dt.setUTCDate(dt.getUTCDate() + 1)) {
    const iso = dt.toISOString().slice(0, 10);
    out.push(iso);
    if (iso >= end) break;
    // Guard against a malformed/unreachable end date looping forever.
    if (out.length > 366) break;
  }
  return out;
}

/** Live-subscribes to a single trip by id (undefined while loading / not found). */
export function useTrip(id: string): TripMeta | undefined {
  const trips = useTrips();
  return trips.find((t) => t.id === id);
}
