"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  buildEntities,
  resolveTripEntities,
  type Entity,
  type ItinDay,
} from "@/lib/entities";
import { subscribeEntities, subscribeTripItems, type DBEntity, type TripItem } from "@/lib/db";
import { firebaseConfigured } from "@/lib/firebase";

type TripDataValue = {
  tripId: string;
  tripAreas: string[];
  days: ItinDay[];
  tz: string;
  entities: Entity[];
  removedEntities: DBEntity[];
  seeded: boolean;
  loading: boolean;
  refreshItinerary: () => Promise<void>;
};

const Ctx = createContext<TripDataValue | null>(null);

export function TripDataProvider({
  tripId,
  tripAreas,
  children,
}: {
  tripId: string;
  tripAreas: string[];
  children: ReactNode;
}) {
  const [days, setDays] = useState<ItinDay[]>([]);
  const [tz, setTz] = useState("Europe/London");
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [itinLoaded, setItinLoaded] = useState(false);

  const loadItinerary = async (fresh = false) => {
    const res = await fetch(`/api/itinerary${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
    const data = await res.json();
    setDays(data.days ?? []);
    setTz(data.tz ?? "Europe/London");
  };

  useEffect(() => {
    loadItinerary().finally(() => setItinLoaded(true));
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const unsubE = subscribeEntities(setDbEntities);
    const unsubI = subscribeTripItems(tripId, setItems);
    return () => {
      unsubE();
      unsubI();
    };
  }, [tripId]);

  const seeded = dbEntities.length > 0;
  const entities = seeded
    ? resolveTripEntities({ dbEntities, items, days, tz, tripAreas })
    : buildEntities(days, tz);

  const removedIds = new Set(items.filter((i) => i.removed && !i.added).map((i) => i.entityId));
  const removedEntities = dbEntities.filter((d) => removedIds.has(d.id));

  return (
    <Ctx.Provider
      value={{
        tripId,
        tripAreas,
        days,
        tz,
        entities,
        removedEntities,
        seeded,
        loading: !itinLoaded,
        refreshItinerary: () => loadItinerary(true),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTripData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTripData must be used inside TripDataProvider");
  return ctx;
}
