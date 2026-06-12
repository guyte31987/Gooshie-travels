"use client";

// Trip itinerary, backed by Firestore (the new Slots + Instances model). Wraps
// the presentational <ItineraryCalendar>: subscribes to the Database entities +
// this trip's slots/instances, and persists every edit. Editing is gated to
// admins/editors; everyone else gets a read-only calendar.

import { useEffect, useMemo, useState } from "react";
import { ItineraryCalendar, type CalEntity, type CalSlot, type CalInstance, type CalHandlers } from "./ItineraryGrid";
import { useAuth } from "./AuthProvider";
import { getTrip, tripDays } from "@/lib/trips";
import { subscribeEntities, saveEntity, seedEntitiesIfNew, type DBEntity } from "@/lib/db";
import { suggestGeneralArea } from "@/lib/areas";
import {
  subscribeSlots, subscribePlanInstances, saveSlot, savePlanInstance, deleteSlot, deletePlanInstance,
  seedItinerary, isItinerarySeeded, instanceId, type Slot, type PlanInstance,
} from "@/lib/itinerary";
import { nycSeedSlots, nycSeedInstances, nycSeedEntities } from "@/lib/itinerary-seed";
import { PREVIEW_STAYS } from "@/lib/preview-data";

export function ItineraryBoard({ tripId }: { tripId: string }) {
  const trip = getTrip(tripId);
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instances, setInstances] = useState<PlanInstance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const unsubE = subscribeEntities(setDbEntities);
    const unsubS = subscribeSlots(tripId, (s) => { setSlots(s); setLoaded(true); });
    const unsubI = subscribePlanInstances(tripId, setInstances);
    return () => { unsubE(); unsubS(); unsubI(); };
  }, [tripId]);

  const entityById = useMemo(() => {
    const nameOf = new Map(dbEntities.map((e) => [e.id, e.name]));
    const m = new Map<string, CalEntity>();
    for (const e of dbEntities) {
      m.set(e.id, {
        id: e.id, name: e.name, type: e.type,
        area: e.area || e.generalArea, parent: e.parentId ? nameOf.get(e.parentId) : undefined,
        address: e.address, website: e.website, instagram: e.instagram, hours: e.hours,
      });
    }
    return m;
  }, [dbEntities]);

  const calSlots: CalSlot[] = useMemo(() => slots.map((s) => ({ id: s.id, day: s.day, start: s.start, end: s.end, label: s.label })), [slots]);
  const calInstances: CalInstance[] = useMemo(() => instances.map((i) => ({ slotId: i.slotId, entityId: i.entityId, capacity: i.capacity, note: i.note, status: i.status, bookingStatus: i.bookingStatus, needsBooking: i.needsBooking, booked: i.booked })), [instances]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  if (!trip) return <p className="py-12 text-center text-sm text-slate-400">Trip not found.</p>;
  const days = tripDays(trip);

  const seed = async () => {
    if (await isItinerarySeeded(tripId)) return;
    setSeeding(true);
    try {
      // Seed entities first (using exact preview IDs) then slots + instances.
      await seedEntitiesIfNew(nycSeedEntities());
      await seedItinerary(nycSeedSlots(tripId), nycSeedInstances(tripId));
    } finally { setSeeding(false); }
  };

  const reseedEntities = async () => {
    setSeeding(true);
    try { await seedEntitiesIfNew(nycSeedEntities()); }
    finally { setSeeding(false); }
  };

  if (!loaded) return <p className="py-12 text-center text-sm text-slate-400">Loading itinerary…</p>;

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-500">No itinerary yet for this trip.</p>
        {canEdit && (
          <button onClick={seed} disabled={seeding} className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {seeding ? "Seeding…" : "Seed from the reviewed mapping"}
          </button>
        )}
      </div>
    );
  }

  const handlers: CalHandlers = {
    onMoveSlot: (id, next) => { const s = slotById.get(id); if (s) saveSlot({ ...s, ...next }); },
    onAddSlot: (slot, inst) => {
      saveSlot({ id: slot.id, tripId, day: slot.day, start: slot.start, end: slot.end, label: slot.label });
      savePlanInstance({ id: instanceId(inst.slotId, inst.entityId), tripId, slotId: inst.slotId, entityId: inst.entityId, capacity: inst.capacity, note: inst.note ?? "" });
    },
    onDeleteSlot: (id, instIds) => { deleteSlot(tripId, id, instIds); },
    onMakeMain: (slotId, entityId) => {
      for (const i of instances.filter((x) => x.slotId === slotId)) {
        const cap = i.entityId === entityId ? "confirmed" : i.capacity !== "planB" ? "planB" : i.capacity;
        if (cap !== i.capacity) savePlanInstance({ ...i, capacity: cap });
      }
    },
    onUpdateInstance: (slotId, entityId, patch) => {
      const id = instanceId(slotId, entityId);
      const cur = instances.find((i) => i.id === id);
      if (cur) savePlanInstance({ ...cur, ...patch });
    },
    onRenameSlot: (slotId, label) => { const s = slotById.get(slotId); if (s) saveSlot({ ...s, label }); },
    onSaveEntity: (entityId, patch) => {
      const existing = dbEntities.find((e) => e.id === entityId);
      saveEntity({
        ...(existing ?? {}),
        id: entityId, name: patch.name, type: patch.type,
        area: patch.area, address: patch.address, website: patch.website,
        instagram: patch.instagram, hours: patch.hours,
        notes: patch.notes ?? existing?.notes,
        generalArea: existing?.generalArea ?? suggestGeneralArea(patch.area, patch.address, patch.name),
      });
    },
  };

  return (
    <div>
      {canEdit && (
        <div className="mb-2 flex justify-end">
          <button onClick={reseedEntities} disabled={seeding} title="Ensure all itinerary places exist in the Database (safe to re-run)"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            {seeding ? "…" : "↻ Fix entity IDs"}
          </button>
        </div>
      )}
      <ItineraryCalendar calName={`${trip.name} — Gooshie`} days={days} entityById={entityById}
        slots={calSlots} instances={calInstances} stays={tripId === "nyc-2026" ? PREVIEW_STAYS : []}
        canEdit={canEdit} handlers={handlers} />
    </div>
  );
}
