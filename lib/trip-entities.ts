"use client";

// Build a trip's Entity[] (with their .slots) from the NEW model — the Database
// entities + this trip's app-owned Slots/Instances. Replaces the calendar-parsing
// resolveTripEntities: an entity's appearances now come straight from the
// PlanInstances that reference it (no fuzzy matching, no calendar).

import type { DBEntity, TripItem } from "./db";
import type { Slot, PlanInstance } from "./itinerary";
import type { Entity, TripSlot, SlotKind } from "./entities";

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
}
function timeLabel(min: number): string {
  let h = Math.floor(min / 60); const mm = min % 60;
  const am = h < 12 || h >= 24 ? "AM" : "PM"; h = h % 24;
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(mm).padStart(2, "0")} ${am}`;
}

const dbToEntity = (de: DBEntity): Entity => ({ ...de, slots: [] });

/**
 * Resolve a trip's entities. Membership: an entity is in the trip if its region
 * matches the trip (and isn't removed), or it was explicitly added — OR it has
 * any instance scheduled. Its .slots are derived from the trip's instances.
 */
export function buildTripEntities(opts: {
  dbEntities: DBEntity[];
  items: TripItem[];
  slots: Slot[];
  instances: PlanInstance[];
  tripAreas: string[];
}): Entity[] {
  const { dbEntities, items, slots, instances, tripAreas } = opts;
  const itemBy = new Map(items.map((i) => [i.entityId, i]));
  const areaSet = new Set(tripAreas);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  // Group instances by entity → TripSlot[].
  const byEntity = new Map<string, TripSlot[]>();
  for (const inst of instances) {
    const slot = slotById.get(inst.slotId);
    if (!slot) continue;
    const ts: TripSlot = {
      kind: inst.capacity as SlotKind,
      dayKey: slot.day,
      time: timeLabel(slot.start),
      label: `${dayLabel(slot.day)}, ${timeLabel(slot.start)}`,
      startMs: undefined,
      note: inst.note,
      uid: inst.id, // carries the PlanInstance id for booking/comments
    };
    (byEntity.get(inst.entityId) ?? byEntity.set(inst.entityId, []).get(inst.entityId)!).push(ts);
  }
  for (const arr of byEntity.values()) arr.sort((a, b) => (a.dayKey ?? "").localeCompare(b.dayKey ?? ""));

  const out: Entity[] = [];
  for (const de of dbEntities) {
    const item = itemBy.get(de.id);
    const inByArea = de.generalArea ? areaSet.has(de.generalArea) : false;
    const included = item?.added || (inByArea && !item?.removed);
    const entitySlots = byEntity.get(de.id) ?? [];
    if (!included && entitySlots.length === 0) continue;
    out.push({ ...dbToEntity(de), slots: entitySlots });
  }
  return out;
}
