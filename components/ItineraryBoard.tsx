"use client";

// Trip itinerary, backed by Firestore (the new Slots + Instances model). Wraps
// the presentational <ItineraryCalendar>: subscribes to the Database entities +
// this trip's slots/instances, and persists every edit. Editing is gated to
// admins/editors; everyone else gets a read-only calendar.

import { useEffect, useMemo, useRef, useState } from "react";
import { ItineraryCalendar, type CalEntity, type CalSlot, type CalInstance, type CalHandlers } from "./ItineraryGrid";
import { useAuth } from "./AuthProvider";
import { getTrip, tripDays } from "@/lib/trips";
import { subscribeEntities, saveEntity, seedEntitiesIfNew, subscribeTripDoc, saveTripStays, type DBEntity, type TripStay } from "@/lib/db";
import { suggestGeneralArea } from "@/lib/areas";
import { slugId } from "@/lib/slug";
import {
  subscribeSlots, subscribePlanInstances, saveSlot, savePlanInstance, deleteSlot, deletePlanInstance,
  seedItinerary, isItinerarySeeded, instanceId, type Slot, type PlanInstance,
} from "@/lib/itinerary";
import { nycSeedSlots, nycSeedInstances, nycSeedEntities } from "@/lib/itinerary-seed";
import { PREVIEW_STAYS } from "@/lib/preview-data";
import type { IcsStay } from "@/lib/ics-export";

export function ItineraryBoard({ tripId }: { tripId: string }) {
  const trip = getTrip(tripId);
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [instances, setInstances] = useState<PlanInstance[]>([]);
  const [stays, setStays] = useState<IcsStay[] | null>(null); // null = not yet loaded from Firestore
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [history, setHistory] = useState<{ slots: Slot[]; instances: PlanInstance[] }[]>([]);
  // Use refs so handlers (captured in closures) always see current values.
  const slotsRef = useRef(slots);
  const instancesRef = useRef(instances);
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { instancesRef.current = instances; }, [instances]);

  useEffect(() => {
    const unsubE = subscribeEntities(setDbEntities);
    const unsubS = subscribeSlots(tripId, (s) => { setSlots(s); setLoaded(true); });
    const unsubI = subscribePlanInstances(tripId, setInstances);
    const unsubT = subscribeTripDoc(tripId, (t) => setStays(t?.stays ?? []));
    return () => { unsubE(); unsubS(); unsubI(); unsubT(); };
  }, [tripId]);

  // Seed PREVIEW_STAYS into Firestore on first load when Firestore has no stays yet.
  useEffect(() => {
    if (stays !== null && stays.length === 0 && tripId === "nyc-2026") {
      saveTripStays(tripId, PREVIEW_STAYS);
    }
  }, [stays, tripId]);

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
  const calInstances: CalInstance[] = useMemo(() => instances.map((i) => ({ slotId: i.slotId, entityId: i.entityId, capacity: i.capacity, note: i.note, status: i.status, bookingStatus: i.bookingStatus, needsBooking: i.needsBooking, booked: i.booked, photos: i.photos })), [instances]);
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

  const record = () => {
    setHistory((h) => [...h.slice(-30), { slots: [...slotsRef.current], instances: [...instancesRef.current] }]);
  };

  const undo = async () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      // Re-save all previous slots + instances (Firestore merge is idempotent)
      prev.slots.forEach((s) => saveSlot(s));
      prev.instances.forEach((i) => savePlanInstance(i));
      // Delete anything that was added after the snapshot
      const prevSlotIds = new Set(prev.slots.map((s) => s.id));
      const prevInstIds = new Set(prev.instances.map((i) => i.id));
      slotsRef.current.forEach((s) => { if (!prevSlotIds.has(s.id)) deleteSlot(tripId, s.id, []); });
      instancesRef.current.forEach((i) => { if (!prevInstIds.has(i.id)) deletePlanInstance(tripId, i.id); });
      return h.slice(0, -1);
    });
  };

  const handlers: CalHandlers = {
    onGestureStart: record,
    onMoveSlot: (id, next) => { const s = slotById.get(id); if (s) saveSlot({ ...s, ...next }); },
    onAddSlot: (slot, inst) => {
      record();
      saveSlot({ id: slot.id, tripId, day: slot.day, start: slot.start, end: slot.end, label: slot.label });
      savePlanInstance({ id: instanceId(inst.slotId, inst.entityId), tripId, slotId: inst.slotId, entityId: inst.entityId, capacity: inst.capacity, note: inst.note ?? "" });
    },
    onDeleteSlot: (id, instIds) => { record(); deleteSlot(tripId, id, instIds); },
    onMakeMain: (slotId, entityId) => {
      for (const i of instances.filter((x) => x.slotId === slotId)) {
        const cap = i.entityId === entityId ? "confirmed" : i.capacity !== "planB" ? "planB" : i.capacity;
        if (cap !== i.capacity) savePlanInstance({ ...i, capacity: cap });
      }
    },
    onAddAlt: (slotId, entityId) => {
      const id = instanceId(slotId, entityId);
      if (instances.some((i) => i.id === id)) return;
      savePlanInstance({ id, tripId, slotId, entityId, capacity: "planB", note: "" });
    },
    onUpdateInstance: (slotId, entityId, patch) => {
      const id = instanceId(slotId, entityId);
      const cur = instances.find((i) => i.id === id);
      if (cur) savePlanInstance({ ...cur, ...patch });
    },
    onRenameSlot: (slotId, label) => { const s = slotById.get(slotId); if (s) saveSlot({ ...s, label }); },
    onSaveStay: (stay: IcsStay) => {
      const next = [...(stays ?? []).filter((s) => s.from !== stay.from), stay]
        .sort((a, b) => a.from.localeCompare(b.from));
      saveTripStays(tripId, next);
    },
    onDeleteStay: (from: string) => {
      saveTripStays(tripId, (stays ?? []).filter((s) => s.from !== from));
    },
    onSaveEntity: (entityId, patch) => {
      const existing = dbEntities.find((e) => e.id === entityId);
      // If a brand-new venue was typed inline, create the venue entity first then link it.
      let resolvedParentId = patch.parentId ?? existing?.parentId;
      if (resolvedParentId?.startsWith("new-venue:")) {
        const venueName = resolvedParentId.slice("new-venue:".length);
        const venueId = slugId("club", venueName);
        saveEntity({ id: venueId, name: venueName, type: "club", generalArea: suggestGeneralArea(undefined, undefined, venueName) });
        resolvedParentId = venueId;
      }
      // A club entry with a parent is a party/night, not a standalone venue.
      const resolvedType = patch.type === "club" && resolvedParentId ? "party" : patch.type;
      saveEntity({
        ...(existing ?? {}),
        id: entityId, name: patch.name, type: resolvedType,
        area: patch.area, address: patch.address, website: patch.website,
        instagram: patch.instagram, hours: patch.hours,
        notes: patch.notes ?? existing?.notes,
        parentId: resolvedParentId,
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
        slots={calSlots} instances={calInstances} stays={stays ?? []}
        canEdit={canEdit} handlers={handlers} onUndo={undo} canUndo={history.length > 0} />
    </div>
  );
}
