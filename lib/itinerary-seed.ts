"use client";

// Canonical NYC-2026 itinerary seed — the reviewed slot/instance mapping
// (docs/migration/*.csv), ready to write into Firestore via seedItinerary().
// Reuses the same dataset the /preview prototype renders, converted to the
// stored shape (start/end as minutes-from-midnight).
//
// nycSeedEntities() seeds every entity PREVIEW_ENTITIES references using its
// exact hand-crafted ID. This must be called alongside seedItinerary() so
// every instance.entityId resolves in Firestore — the slugId()-based DB seed
// generates different IDs for many of these entities.

import { PREVIEW_SLOTS, PREVIEW_INSTANCES, PREVIEW_ENTITIES } from "./preview-data";
import type { Slot, PlanInstance } from "./itinerary";
import { instanceId } from "./itinerary";
import { suggestGeneralArea } from "./areas";
import { slugId } from "./slug";
import type { DBEntity } from "./db";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

export function nycSeedSlots(tripId: string): Slot[] {
  return PREVIEW_SLOTS.map((s) => {
    const start = toMin(s.start);
    return { id: s.id, tripId, day: s.day, start, end: s.end ? toMin(s.end) : start + 90, label: s.label };
  });
}

/**
 * All entities referenced by the NYC-2026 itinerary, keyed by their exact
 * preview IDs. Feed to seedEntitiesIfNew() so every instance.entityId
 * resolves in Firestore — slugId()-based seeds generate different IDs for
 * entities with apostrophes, accents, &, +, → etc.
 */
export function nycSeedEntities(): DBEntity[] {
  return PREVIEW_ENTITIES.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    generalArea: suggestGeneralArea(e.area, e.address, e.name),
    area: e.area,
    address: e.address,
    website: e.website,
    instagram: e.instagram,
    hours: e.hours,
    parentId: e.parent ? slugId("club", e.parent) : undefined,
  }));
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
