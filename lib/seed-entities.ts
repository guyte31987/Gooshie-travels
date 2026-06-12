"use client";

// Build every Database entity from the bundled curated lists — with no calendar
// involved. Used by the one-time "Seed database" action. Food + vintage are
// mapped here; the rest come from buildCuratedSeedEntities (the SEED_GROUPS).

import { restaurants, vintage } from "./planning";
import { buildCuratedSeedEntities } from "./entities";
import { suggestGeneralArea } from "./areas";
import { slugId } from "./slug";
import type { DBEntity } from "./db";

export function buildAllSeedEntities(): DBEntity[] {
  const food: DBEntity[] = restaurants.map((r) => ({
    id: slugId("food", r.name),
    name: r.name,
    type: "food",
    generalArea: suggestGeneralArea(r.area, r.name),
    area: r.area,
    hours: r.hours,
    price: r.price,
    source: r.source,
    booking: r.booking,
    notes: r.why,
    closed: r.closed,
  }));
  const vint: DBEntity[] = vintage.map((v) => ({
    id: slugId("vintage", v.name),
    name: v.name,
    type: "vintage",
    generalArea: suggestGeneralArea(v.address, v.area),
    area: v.area,
    address: v.address,
    hours: v.hours,
    price: v.price,
    notes: v.vibe,
    bestDay: v.bestDay,
  }));
  return [...food, ...vint, ...buildCuratedSeedEntities()];
}
