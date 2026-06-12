"use client";

// Canonical NYC-2026 itinerary seed — the reviewed slot/instance mapping
// (docs/migration/*.csv), ready to write into Firestore via seedItinerary().
// Reuses the same dataset the /preview prototype renders, converted to the
// stored shape (start/end as minutes-from-midnight).

import { PREVIEW_SLOTS, PREVIEW_INSTANCES } from "./preview-data";
import type { Slot, PlanInstance } from "./itinerary";
import { instanceId } from "./itinerary";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export function nycSeedSlots(tripId: string): Slot[] {
  return PREVIEW_SLOTS.map((s) => {
    const start = toMin(s.start);
    return { id: s.id, tripId, day: s.day, start, end: s.end ? toMin(s.end) : start + 90, label: s.label };
  });
}

export function nycSeedInstances(tripId: string): PlanInstance[] {
  return PREVIEW_INSTANCES.map((i) => ({
    id: instanceId(i.slotId, i.entityId),
    tripId,
    slotId: i.slotId,
    entityId: i.entityId,
    capacity: i.capacity,
    note: i.note,
    needsBooking: i.needsBooking,
    booked: i.booked,
  }));
}
