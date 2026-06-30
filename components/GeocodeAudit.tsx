"use client";

// Admin diagnostic: for a chosen trip's itinerary places, show each place's
// stored pin coordinates next to its address, with a link to eyeball where the
// dot actually sits and a one-click "Re-geocode" that OVERWRITES the stored
// coords from the address. This is the fix for pins that are off because they
// kept stale coordinates (e.g. from old enrichment) that the backfill skipped.

import { useEffect, useMemo, useState } from "react";
import { subscribeEntities, subscribeTripItems, subscribeTrips, saveEntity, type DBEntity, type TripItem, type Trip } from "@/lib/db";
import { subscribeSlots, subscribePlanInstances, type Slot, type PlanInstance } from "@/lib/itinerary";
import { buildTripEntities } from "@/lib/trip-entities";
import { geocodeAddress } from "@/lib/geo";
import { TRIPS } from "@/lib/trips";
import { ENTITY_TABS } from "@/lib/entities";

const emojiOf = (type: string) =>
  ENTITY_TABS.find((t) => t.type === type || (type === "party" && t.type === "club"))?.emoji ?? "•";

const pinLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function GeocodeAudit() {
  const [fsTrips, setFsTrips] = useState<Trip[]>([]);
  useEffect(() => subscribeTrips(setFsTrips), []);
  const trips = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; areas: string[] }>();
    for (const t of TRIPS) byId.set(t.id, { id: t.id, name: t.name, areas: t.areas });
    for (const t of fsTrips) byId.set(t.id, { id: t.id, name: t.name, areas: t.areas ?? [] });
    return [...byId.values()];
  }, [fsTrips]);

  const [tripId, setTripId] = useState("");
  useEffect(() => { if (!tripId && trips.length) setTripId(trips[0].id); }, [trips, tripId]);
  const trip = trips.find((t) => t.id === tripId);

  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instances, setInstances] = useState<PlanInstance[]>([]);
  useEffect(() => subscribeEntities(setDbEntities), []);
  useEffect(() => {
    if (!tripId) return;
    const unsubI = subscribeTripItems(tripId, setItems);
    const unsubS = subscribeSlots(tripId, setSlots);
    const unsubN = subscribePlanInstances(tripId, setInstances);
    return () => { unsubI(); unsubS(); unsubN(); };
  }, [tripId]);

  const dbById = useMemo(() => new Map(dbEntities.map((e) => [e.id, e])), [dbEntities]);

  const places = useMemo(() => {
    if (!trip) return [];
    return buildTripEntities({ dbEntities, items, slots, instances, tripAreas: trip.areas })
      .filter((e) => e.slots.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trip, dbEntities, items, slots, instances]);

  // Re-geocode every itinerary place that has an address, overwriting existing
  // coords. Spaced for Nominatim's ~1 req/sec policy.
  const [runningAll, setRunningAll] = useState(false);
  const [allMsg, setAllMsg] = useState<string | null>(null);
  const regeocodeAll = async () => {
    const todo = places.map((p) => dbById.get(p.id)).filter((e): e is DBEntity => !!e && !!(e.address ?? "").trim());
    if (todo.length === 0) { setAllMsg("No places with an address to re-geocode."); return; }
    setRunningAll(true);
    let done = 0, updated = 0;
    try {
      for (const e of todo) {
        setAllMsg(`Re-geocoding ${done + 1} of ${todo.length}… (${updated} updated)`);
        const pt = await geocodeAddress(e.address!.trim());
        if (pt) { await saveEntity({ ...e, lat: pt.lat, lng: pt.lng }); updated++; }
        done++;
        if (done < todo.length) await new Promise((r) => setTimeout(r, 1100));
      }
      setAllMsg(`Done. Re-geocoded ${updated} of ${todo.length} place${todo.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setAllMsg(err instanceof Error ? err.message : "Re-geocode failed.");
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium">Check &amp; fix map coordinates</div>
          <div className="text-slate-500">
            Itinerary places with their stored pin. Re-geocode overwrites coords from the address.
          </div>
        </div>
        {trips.length > 0 && (
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {places.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={regeocodeAll}
            disabled={runningAll}
            className="rounded-lg bg-rust px-3 py-1.5 text-xs font-medium text-white hover:bg-rust/90 disabled:opacity-50"
          >
            {runningAll ? "Running…" : "Re-geocode all (overwrite)"}
          </button>
          {allMsg && <span className="text-xs text-slate-600">{allMsg}</span>}
        </div>
      )}

      {places.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No itinerary places resolved for this trip yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {places.map((e) => {
            const db = dbById.get(e.id);
            return db ? <AuditRow key={e.id} entity={db} /> : null;
          })}
        </ul>
      )}
    </div>
  );
}

function AuditRow({ entity }: { entity: DBEntity }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const hasCoords = typeof entity.lat === "number" && typeof entity.lng === "number";

  const regeocode = async () => {
    const addr = (entity.address ?? "").trim();
    if (!addr) { setResult("No address to geocode."); return; }
    setBusy(true);
    setResult(null);
    try {
      const pt = await geocodeAddress(addr);
      if (!pt) { setResult("No match for this address."); return; }
      await saveEntity({ ...entity, lat: pt.lat, lng: pt.lng });
      setResult(`Updated → ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium text-slate-700">
          <span className="mr-1">{emojiOf(entity.type)}</span>
          {entity.name}
        </div>
        <div className="truncate text-xs text-slate-400">{entity.address || "— no address —"}</div>
        <div className="mt-0.5 text-[11px]">
          {hasCoords ? (
            <a
              href={pinLink(entity.lat!, entity.lng!)}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              stored pin: {entity.lat!.toFixed(5)}, {entity.lng!.toFixed(5)} ↗
            </a>
          ) : (
            <span className="text-amber-600">no coordinates</span>
          )}
          {result && <span className="ml-2 text-emerald-600">{result}</span>}
        </div>
      </div>
      <button
        onClick={regeocode}
        disabled={busy || !(entity.address ?? "").trim()}
        className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? "…" : "Re-geocode"}
      </button>
    </li>
  );
}
