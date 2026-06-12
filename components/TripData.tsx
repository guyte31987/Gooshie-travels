"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Entity } from "@/lib/entities";
import { buildTripEntities } from "@/lib/trip-entities";
import { subscribeEntities, subscribeTripItems, type DBEntity, type TripItem } from "@/lib/db";
import { subscribeSlots, subscribePlanInstances, type Slot, type PlanInstance } from "@/lib/itinerary";
import { firebaseConfigured } from "@/lib/firebase";

// Trip data hub for the non-itinerary tabs (Trip DB, Map, entity detail). Entities
// and their appearances are derived from the app-owned Slots/Instances model — the
// calendar parser is gone. The Itinerary tab uses ItineraryBoard directly.

export type TripDataValue = {
  tripId: string;
  tripName: string;
  tripAreas: string[];
  entities: Entity[];
  removedEntities: DBEntity[];
  /** PlanInstance by its id (= a TripSlot's `uid`) — for per-visit booking/comments. */
  instanceMap: Map<string, PlanInstance>;
  seeded: boolean;
  loading: boolean;
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
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instances, setInstances] = useState<PlanInstance[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured) { setLoaded(true); return; }
    const unsubE = subscribeEntities(setDbEntities);
    const unsubI = subscribeTripItems(tripId, setItems);
    const unsubS = subscribeSlots(tripId, (s) => { setSlots(s); setLoaded(true); });
    const unsubN = subscribePlanInstances(tripId, setInstances);
    return () => { unsubE(); unsubI(); unsubS(); unsubN(); };
  }, [tripId]);

  const entities = useMemo(
    () => buildTripEntities({ dbEntities, items, slots, instances, tripAreas }),
    [dbEntities, items, slots, instances, tripAreas]
  );
  const instanceMap = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);

  const removedIds = useMemo(() => new Set(items.filter((i) => i.removed && !i.added).map((i) => i.entityId)), [items]);
  const removedEntities = useMemo(() => dbEntities.filter((d) => removedIds.has(d.id)), [dbEntities, removedIds]);

  return (
    <Ctx.Provider
      value={{ tripId, tripName, tripAreas, entities, removedEntities, instanceMap, seeded: dbEntities.length > 0, loading: !loaded }}
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

export function useOptionalTripData(): TripDataValue | null {
  return useContext(Ctx);
}
