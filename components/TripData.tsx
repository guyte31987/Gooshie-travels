"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  buildEntities,
  resolveTripEntities,
  type Entity,
  type ItinDay,
} from "@/lib/entities";
import {
  subscribeEntities,
  subscribeTripItems,
  subscribeInstances,
  type DBEntity,
  type TripItem,
  type Instance,
} from "@/lib/db";
import { firebaseConfigured } from "@/lib/firebase";

type TripDataValue = {
  tripId: string;
  tripName: string;
  tripAreas: string[];
  days: ItinDay[];
  tz: string;
  entities: Entity[];
  removedEntities: DBEntity[];
  instanceMap: Map<string, Instance>;
  seeded: boolean;
  loading: boolean;
  refreshItinerary: () => Promise<void>;
};

const Ctx = createContext<TripDataValue | null>(null);

export function TripDataProvider({
  tripId,
  tripName,
  tripAreas,
  children,
}: {
  tripId: string;
  tripName: string;
  tripAreas: string[];
  children: ReactNode;
}) {
  const [days, setDays] = useState<ItinDay[]>([]);
  const [tz, setTz] = useState("Europe/London");
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
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
    const unsubN = subscribeInstances(tripId, setInstances);
    return () => {
      unsubE();
      unsubI();
      unsubN();
    };
  }, [tripId]);

  const seeded = dbEntities.length > 0;
  const entities = seeded
    ? resolveTripEntities({ dbEntities, items, days, tz, tripAreas, instances })
    : buildEntities(days, tz);
  const instanceMap = new Map(instances.map((i) => [i.id, i]));

  const removedIds = new Set(items.filter((i) => i.removed && !i.added).map((i) => i.entityId));
  const removedEntities = dbEntities.filter((d) => removedIds.has(d.id));

  return (
    <Ctx.Provider
      value={{
        tripId,
        tripName,
        tripAreas,
        days,
        tz,
        entities,
        removedEntities,
        instanceMap,
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
