"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildEntities,
  resolveTripEntities,
  type Entity,
  type ItinDay,
  type ItinEvent,
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
  /** Days with orphaned locked instances (whose calendar events are gone) injected. Use this for rendering the itinerary. */
  augmentedDays: ItinDay[];
  tz: string;
  entities: Entity[];
  removedEntities: DBEntity[];
  instanceMap: Map<string, Instance>;
  /** All instances with removed:true — editors can restore, admins can delete forever. */
  archivedInstances: Instance[];
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

  const archivedInstances = useMemo(() => instances.filter((i) => i.removed), [instances]);

  // Inject locked orphans (locked instances whose calendar events no longer exist)
  // into the augmented day list so the Schedule can render them.
  const augmentedDays = useMemo(() => {
    const liveUids = new Set(days.flatMap((d) => d.events.map((e) => e.uid)));
    const orphans = instances.filter(
      (i) => i.scheduleLocked && !i.removed && i.dayKey && !liveUids.has(i.id)
    );
    if (!orphans.length) return days;

    const dayMap = new Map<string, ItinDay>(days.map((d) => [d.dayKey, { ...d, events: [...d.events] }]));
    for (const o of orphans) {
      const synthetic: ItinEvent = {
        uid: o.id,
        summary: o.title ?? "(locked event)",
        description: o.note ?? undefined,
        startMs: o.startMs,
        isAllDay: !o.startMs,
        orphaned: true,
      };
      let day = dayMap.get(o.dayKey!);
      if (!day) {
        day = { dayKey: o.dayKey!, events: [], basedIn: [] };
        dayMap.set(o.dayKey!, day);
      }
      const insertIdx = day.events.findIndex((e) => (e.startMs ?? 0) > (o.startMs ?? 0));
      if (insertIdx === -1) day.events.push(synthetic);
      else day.events.splice(insertIdx, 0, synthetic);
    }
    return Array.from(dayMap.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [days, instances]);

  return (
    <Ctx.Provider
      value={{
        tripId,
        tripName,
        tripAreas,
        days,
        augmentedDays,
        tz,
        entities,
        removedEntities,
        instanceMap,
        archivedInstances,
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
