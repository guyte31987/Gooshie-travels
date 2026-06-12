// The unified Entity model + curated seed builders. The calendar parser that
// used to live here (categorizeEvent / matchesEntity / buildEntities / …) is
// gone — a trip's appearances now come from the app-owned Slots/Instances model
// (see lib/trip-entities.ts). This file keeps the Entity types, the tab metadata,
// and the bundled-list → Database seed.

import {
  museums,
  clubs,
  bars,
  spas,
  sights,
  hikes,
  attractions,
  shows,
  events,
  accommodation,
  type SeedPlace,
} from "./planning";
import { suggestGeneralArea } from "./areas";
import { slugId } from "./slug";
import type { DBEntity } from "./db";

/** Curated place lists, each tagged with the EntityType its file represents. */
const SEED_GROUPS: { type: EntityType; places: SeedPlace[] }[] = [
  { type: "museum", places: museums },
  { type: "club", places: clubs },
  { type: "bar", places: bars },
  { type: "spa", places: spas },
  { type: "sight", places: sights },
  { type: "hike", places: hikes },
  { type: "attraction", places: attractions },
  { type: "show", places: shows },
  { type: "event", places: events },
  { type: "accommodation", places: accommodation },
];

export type EntityType =
  | "food"
  | "vintage"
  | "museum"
  | "club"
  | "party" // legacy — kept for existing Firestore docs; displayed under Clubs tab
  | "bar"
  | "spa" // labelled "Wellness" in the UI; key kept as "spa" for stored docs
  | "sight"
  | "attraction"
  | "hike"
  | "show"
  | "event"
  | "accommodation"
  | "travel"
  | "admin"
  | "uncategorised";

export const ENTITY_TABS: { type: EntityType; label: string; emoji: string; operational?: boolean }[] = [
  { type: "food", label: "Food", emoji: "🍴" },
  { type: "vintage", label: "Vintage", emoji: "👕" },
  { type: "museum", label: "Museums", emoji: "🖼" },
  { type: "club", label: "Clubs", emoji: "🎶" },
  { type: "bar", label: "Bars", emoji: "🍸" },
  { type: "spa", label: "Wellness", emoji: "🧖" },
  { type: "sight", label: "Sights", emoji: "📸" },
  { type: "attraction", label: "Attractions", emoji: "🎢" },
  { type: "hike", label: "Hikes", emoji: "🥾" },
  { type: "show", label: "Shows", emoji: "🎭" },
  { type: "event", label: "Events", emoji: "🎫" },
  { type: "accommodation", label: "Stays", emoji: "🛏" },
  { type: "travel", label: "Travel", emoji: "✈️", operational: true },
  { type: "admin", label: "Admin", emoji: "📋", operational: true },
  { type: "uncategorised", label: "Uncategorised", emoji: "❓" },
];

/** Types that are trip-operational (not place-based) — hidden by default in Database and Planning. */
export const OPERATIONAL_TYPES = new Set<EntityType>(["travel", "admin"]);

/** Catch-all "bucket" types for logistics / glue (drives, check-ins, misc). */
export const PARKED_TYPES = new Set<EntityType>(["travel", "admin", "uncategorised"]);

export type SlotKind = "confirmed" | "planned" | "planB";

export type TripSlot = {
  kind: SlotKind;
  dayKey?: string;
  label: string;
  /** Time-of-day, when known (e.g. "6:00 PM"). */
  time?: string;
  /** Epoch ms of the start — kept for compatibility. */
  startMs?: number;
  note?: string;
  mismatch?: boolean;
  /** The PlanInstance id this appearance came from (for booking/comments). */
  uid?: string;
  locked?: boolean;
  /** Original event title — kept optional for compatibility. */
  eventSummary?: string;
};

export type Entity = {
  id: string;
  name: string;
  type: EntityType;
  generalArea?: string;
  area?: string;
  address?: string;
  lat?: number;
  lng?: number;
  website?: string;
  instagram?: string;
  hours?: string;
  price?: string;
  source?: string;
  booking?: string;
  notes?: string;
  closed?: boolean;
  bestDay?: string;
  needsBooking?: boolean;
  /** True when derived from an item not yet saved in the Database. */
  transient?: boolean;
  parentId?: string;
  slots: TripSlot[];
};

// --- seed helpers -----------------------------------------------------------

function slotDayLabel(dayKey: string, time?: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const wk = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return time ? `${wk}, ${time}` : wk;
}

const TRIP_DAYS = /\b(1[89]|2[0-8])\b/g; // June 18–28

/** Parse a list "bestDay" string into planned + Plan B slots. */
function parsePlannedSlots(raw: string): TripSlot[] {
  if (!raw || /not this trip/i.test(raw)) return [];
  const isPlanB = /(plan b|backup|fallback|\balt\b|alt\)|if )/i.test(raw);
  const kind: SlotKind = isPlanB ? "planB" : "planned";
  const days = Array.from(raw.matchAll(TRIP_DAYS)).map((m) => `2026-06-${m[1]}`);
  if (days.length === 0) {
    return [{ kind, label: kind === "planB" ? "Plan B" : "Flexible", note: raw }];
  }
  return Array.from(new Set(days)).map((dayKey) => ({
    kind,
    dayKey,
    label: slotDayLabel(dayKey),
    note: raw,
  }));
}

/** Build a plain Entity (no DB id collision) from a curated seed place. */
function seedToEntity(p: SeedPlace, groupType: EntityType): Entity {
  const type = p.type ?? groupType;
  return {
    id: slugId(type, p.name),
    name: p.name,
    type,
    generalArea: suggestGeneralArea(p.generalArea, p.area, p.address, p.name),
    area: p.area,
    address: p.address,
    website: p.website,
    instagram: p.instagram,
    hours: p.hours,
    price: p.price,
    booking: p.booking,
    notes: p.notes,
    bestDay: p.bestDay,
    parentId: p.parent ? slugId("club", p.parent) : undefined,
    slots: parsePlannedSlots(p.bestDay ?? ""),
  };
}

/** Strip computed slots; keep just the storable attributes (with a stable id). */
function toDBEntity(e: Entity): DBEntity {
  return {
    id: slugId(e.type, e.name),
    name: e.name,
    type: e.type,
    generalArea: e.generalArea,
    area: e.area,
    address: e.address,
    lat: e.lat,
    lng: e.lng,
    website: e.website,
    instagram: e.instagram,
    hours: e.hours,
    price: e.price,
    source: e.source,
    booking: e.booking,
    notes: e.notes,
    closed: e.closed,
    bestDay: e.bestDay,
    needsBooking: e.needsBooking,
    parentId: e.parentId,
  };
}

/**
 * The curated places (clubs, museums, sights, hikes, spas, attractions, events,
 * stays) as Database-ready entities — for seeding a fresh DB or back-filling.
 */
export function buildCuratedSeedEntities(): DBEntity[] {
  const out: DBEntity[] = [];
  for (const g of SEED_GROUPS) for (const p of g.places) out.push(toDBEntity(seedToEntity(p, g.type)));
  return out;
}

export function groupByType(entities: Entity[]): Record<EntityType, Entity[]> {
  const out = {} as Record<EntityType, Entity[]>;
  for (const tab of ENTITY_TABS) out[tab.type] = [];
  for (const e of entities) {
    const bucket = (e.type === "party" ? "club" : e.type) as EntityType;
    (out[bucket] ||= []).push(e);
  }
  return out;
}
