"use client";

// Admin maintenance tool: list every place in a chosen trip that has no Google
// Maps link yet, with an inline box to paste one and save. Saved places drop off
// the list immediately (the entity stream updates). Trip membership reuses the
// exact same logic as the app (buildTripEntities), so "in the trip" means here
// what it means everywhere else.

import { useEffect, useMemo, useState } from "react";
import { subscribeEntities, subscribeTripItems, subscribeTrips, saveEntity, type DBEntity, type TripItem, type Trip } from "@/lib/db";
import { subscribeSlots, subscribePlanInstances, type Slot, type PlanInstance } from "@/lib/itinerary";
import { buildTripEntities } from "@/lib/trip-entities";
import { TRIPS } from "@/lib/trips";
import { ENTITY_TABS } from "@/lib/entities";

const emojiOf = (type: string) =>
  ENTITY_TABS.find((t) => t.type === type || (type === "party" && t.type === "club"))?.emoji ?? "•";

export function TripMapsFiller() {
  // Trip list: Firestore trips merged with the static catalog (by id).
  const [fsTrips, setFsTrips] = useState<Trip[]>([]);
  useEffect(() => subscribeTrips(setFsTrips), []);
  const trips = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; areas: string[] }>();
    for (const t of TRIPS) byId.set(t.id, { id: t.id, name: t.name, areas: t.areas });
    for (const t of fsTrips) byId.set(t.id, { id: t.id, name: t.name, areas: t.areas ?? [] });
    return [...byId.values()];
  }, [fsTrips]);

  const [tripId, setTripId] = useState("");
  useEffect(() => {
    if (!tripId && trips.length) setTripId(trips[0].id);
  }, [trips, tripId]);
  const trip = trips.find((t) => t.id === tripId);

  // Subscribe to everything needed to resolve this trip's entities.
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instances, setInstances] = useState<PlanInstance[]>([]);
  useEffect(() => {
    const unsubE = subscribeEntities(setDbEntities);
    return unsubE;
  }, []);
  useEffect(() => {
    if (!tripId) return;
    const unsubI = subscribeTripItems(tripId, setItems);
    const unsubS = subscribeSlots(tripId, setSlots);
    const unsubN = subscribePlanInstances(tripId, setInstances);
    return () => { unsubI(); unsubS(); unsubN(); };
  }, [tripId]);

  const dbById = useMemo(() => new Map(dbEntities.map((e) => [e.id, e])), [dbEntities]);

  // Only places that actually appear in the itinerary (have a scheduled slot),
  // vs. every eligible trip member (area-matched + added). Default: itinerary only.
  const [itineraryOnly, setItineraryOnly] = useState(true);

  // The trip's eligible entities, optionally narrowed to those on the itinerary.
  const scoped = useMemo(() => {
    if (!trip) return [];
    const entities = buildTripEntities({ dbEntities, items, slots, instances, tripAreas: trip.areas });
    return itineraryOnly ? entities.filter((e) => e.slots.length > 0) : entities;
  }, [trip, dbEntities, items, slots, instances, itineraryOnly]);

  const missing = useMemo(
    () => scoped.filter((e) => !(e.mapsUrl ?? "").trim()).sort((a, b) => a.name.localeCompare(b.name)),
    [scoped]
  );
  const total = scoped.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium">Add missing Google Maps links</div>
          <div className="text-slate-500">Places in this trip without a saved Maps link.</div>
        </div>
        {trips.length > 0 && (
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={itineraryOnly}
          onChange={(e) => setItineraryOnly(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-slate-300"
        />
        Only places scheduled in the itinerary
      </label>

      <p className="mt-2 text-xs font-medium text-slate-500">
        {missing.length === 0
          ? total === 0
            ? "No places resolved for this trip yet."
            : "All places in this trip have a Maps link. 🎉"
          : `${missing.length} of ${total} place${total === 1 ? "" : "s"} still need a link.`}
      </p>

      {missing.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {missing.map((e) => {
            const db = dbById.get(e.id);
            return db ? <FillRow key={e.id} entity={db} /> : null;
          })}
        </ul>
      )}
    </div>
  );
}

/** One place: name + area on the left, a paste-and-save Maps link box on the right. */
function FillRow({ entity }: { entity: DBEntity }) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = url.trim();
    if (!v) return;
    setSaving(true);
    try {
      await saveEntity({ ...entity, mapsUrl: v });
      // No reset needed — the entity stream will drop this row once mapsUrl is set.
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium text-slate-700">
          <span className="mr-1">{emojiOf(entity.type)}</span>
          {entity.name}
        </div>
        <div className="truncate text-xs text-slate-400">
          {entity.area || entity.generalArea || entity.address || "—"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="Paste Google Maps link"
          className="w-56 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
        />
        <button
          onClick={save}
          disabled={saving || !url.trim()}
          className="rounded-lg bg-rust px-3 py-1 text-xs font-medium text-white hover:bg-rust/90 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
    </li>
  );
}
