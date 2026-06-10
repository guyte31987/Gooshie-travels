// Unified entity model. Every planning "thing" — a restaurant, museum, party,
// hike, shop, accommodation — becomes an Entity with well-defined attributes
// plus the trip-slots that say where/when it appears (Confirmed from the
// calendar, Planned/Plan B from the lists). The calendar is the master for the
// schedule, so planned slots that disagree with a confirmed one are flagged.

import { restaurants, vintage, type Restaurant, type VintageShop } from "./planning";

export type EntityType =
  | "food"
  | "vintage"
  | "museum"
  | "party"
  | "sight"
  | "hike"
  | "event"
  | "accommodation";

export const ENTITY_TABS: { type: EntityType; label: string; emoji: string }[] = [
  { type: "food", label: "Food", emoji: "🍴" },
  { type: "vintage", label: "Vintage", emoji: "👕" },
  { type: "museum", label: "Museums", emoji: "🖼" },
  { type: "party", label: "Parties", emoji: "🎉" },
  { type: "sight", label: "Sights", emoji: "📸" },
  { type: "hike", label: "Hikes", emoji: "🥾" },
  { type: "event", label: "Events", emoji: "🎫" },
  { type: "accommodation", label: "Stays", emoji: "🛏" },
];

export type SlotKind = "confirmed" | "planned" | "planB";

export type TripSlot = {
  kind: SlotKind;
  dayKey?: string;
  label: string;
  note?: string;
  mismatch?: boolean;
};

export type Entity = {
  id: string;
  name: string;
  type: EntityType;
  area?: string;
  address?: string;
  hours?: string;
  price?: string;
  source?: string;
  booking?: string;
  notes?: string;
  closed?: boolean;
  bestDay?: string;
  slots: TripSlot[];
};

// --- calendar shapes (mirror of the /api/itinerary response) ---------------

export type ItinEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startMs?: number;
  endMs?: number;
  isAllDay: boolean;
  allDayStart?: string;
  allDayEnd?: string;
};
export type ItinDay = { dayKey: string; events: ItinEvent[]; basedIn: ItinEvent[] };

// --- helpers ---------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ") // [MOS] tags
    .replace(/\([^)]*\)/g, " ") // (v16 Locked…)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slotDayLabel(dayKey: string, tz: string, time?: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const wk = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return time ? `${wk}, ${time}` : wk;
}

function timeOf(e: ItinEvent, tz: string): string | undefined {
  if (e.isAllDay || typeof e.startMs !== "number") return undefined;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(e.startMs)
  );
}

/**
 * Classify a calendar event into an entity type via keyword rules. Matches on
 * the title + location only — descriptions contain misleading words (a museum's
 * description naming "Trail House Kitchen", a party titled "Soul Summit").
 */
export function categorizeEvent(e: ItinEvent): EntityType {
  const t = `${e.summary} ${e.location ?? ""}`.toLowerCase();
  if (
    /\b(museum|moca|cloisters|gallery|art center|art institute|studio museum|new museum|dia beacon|clark art|storm king art)\b/.test(
      t
    )
  )
    return "museum";
  if (
    /\b(fist|basement|house of yes|\bhoy\b|3db|3 dollar bill|nowadays|mister sunday|soul summit|pure honey|ladyland|drag|pride|club|festival|blessed madonna|comedy|joe.s pub|sultan)\b/.test(
      t
    )
  )
    return "party";
  if (/\b(hike|trail|falls|mountain|greylock|cascade|kaaterskill|ledge)\b/.test(t)) return "hike";
  if (
    /\b(high line|coney|boardwalk|beach|riis|hersheypark|chocolate world|mermaid parade|seneca|banya|spa|water park|storm king)\b/.test(
      t
    )
  )
    return "sight";
  if (/\b(dinner|brunch|lunch|breakfast|cafe|coffee|food|bagel|pizza|bites|bbq|deli|snack|eat)\b/.test(t))
    return "food";
  return "event";
}

const TRIP_DAYS = /\b(1[89]|2[0-8])\b/g; // June 18–28

/** Parse a list "days" / "bestDay" string into planned + Plan B slots. */
function parsePlannedSlots(raw: string, tz: string): TripSlot[] {
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
    label: slotDayLabel(dayKey, tz),
    note: raw,
  }));
}

// Looser than norm(): keeps text inside parentheses (event titles often name
// the actual places there, e.g. "Vintage Shopping (Procell & Desert Vintage)").
function normLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesEntity(entityName: string, e: ItinEvent): boolean {
  const n = normLoose(entityName);
  if (n.length < 4) return false;
  const hay = `${normLoose(e.summary)} ${normLoose(e.location ?? "")}`;
  return hay.includes(n);
}

// --- the builder -----------------------------------------------------------

export function buildEntities(days: ItinDay[], tz: string): Entity[] {
  const allEvents: ItinEvent[] = days.flatMap((d) => d.events);
  const dayKeyOf = new Map<string, string>();
  for (const d of days) for (const e of d.events) dayKeyOf.set(e.uid, d.dayKey);

  const matchedUids = new Set<string>();
  const entities: Entity[] = [];

  const confirmedSlotFor = (e: ItinEvent): TripSlot => {
    const dk = dayKeyOf.get(e.uid)!;
    return { kind: "confirmed", dayKey: dk, label: slotDayLabel(dk, tz, timeOf(e, tz)) };
  };

  const attachSlots = (planned: TripSlot[], confirmed: TripSlot[]): TripSlot[] => {
    const confirmedDays = new Set(confirmed.map((s) => s.dayKey).filter(Boolean));
    const keptPlanned = planned
      .filter((p) => !(p.dayKey && confirmedDays.has(p.dayKey))) // agrees → already shown
      .map((p) =>
        p.dayKey && confirmedDays.size > 0 ? { ...p, mismatch: true } : p
      );
    return [...confirmed, ...keptPlanned];
  };

  // 1) Food entities (list-backed)
  for (const r of restaurants as Restaurant[]) {
    const confirmed = allEvents.filter((e) => matchesEntity(r.name, e));
    confirmed.forEach((e) => matchedUids.add(e.uid));
    entities.push({
      id: "food:" + r.name,
      name: r.name,
      type: "food",
      area: r.area,
      hours: r.hours,
      price: r.price,
      source: r.source,
      booking: r.booking,
      notes: r.why,
      closed: r.closed,
      slots: attachSlots(parsePlannedSlots(r.days, tz), confirmed.map(confirmedSlotFor)),
    });
  }

  // 2) Vintage entities (list-backed)
  for (const v of vintage as VintageShop[]) {
    const confirmed = allEvents.filter((e) => matchesEntity(v.name, e));
    confirmed.forEach((e) => matchedUids.add(e.uid));
    entities.push({
      id: "vintage:" + v.name,
      name: v.name,
      type: "vintage",
      area: v.area,
      address: v.address,
      hours: v.hours,
      price: v.price,
      notes: v.vibe,
      bestDay: v.bestDay,
      slots: attachSlots(parsePlannedSlots(v.bestDay, tz), confirmed.map(confirmedSlotFor)),
    });
  }

  // 3) Accommodation entities (multi-day stays), deduped by name
  const stays = new Map<string, ItinEvent>();
  for (const d of days) for (const s of d.basedIn) if (!stays.has(s.summary)) stays.set(s.summary, s);
  for (const s of stays.values()) {
    const label =
      s.allDayStart && s.allDayEnd
        ? `${slotDayLabel(s.allDayStart, tz)} → ${slotDayLabel(addDays(s.allDayEnd, -1), tz)}`
        : "Stay";
    entities.push({
      id: "stay:" + s.summary,
      name: s.summary,
      type: "accommodation",
      address: s.location,
      slots: [{ kind: "confirmed", dayKey: s.allDayStart, label }],
    });
  }

  // 4) Remaining calendar events → categorized entities, grouped by name
  const byKey = new Map<string, { name: string; type: EntityType; events: ItinEvent[] }>();
  for (const e of allEvents) {
    if (matchedUids.has(e.uid)) continue;
    const type = categorizeEvent(e);
    const key = type + ":" + norm(e.summary);
    if (!byKey.has(key)) byKey.set(key, { name: e.summary, type, events: [] });
    byKey.get(key)!.events.push(e);
  }
  for (const [key, group] of byKey) {
    const first = group.events[0];
    entities.push({
      id: "cal:" + key,
      name: cleanName(group.name),
      type: group.type,
      address: first.location,
      notes: first.description,
      slots: group.events.map(confirmedSlotFor),
    });
  }

  return entities;
}

function cleanName(s: string): string {
  return s.replace(/\[[^\]]*\]\s*/g, "").replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

export function groupByType(entities: Entity[]): Record<EntityType, Entity[]> {
  const out = {} as Record<EntityType, Entity[]>;
  for (const tab of ENTITY_TABS) out[tab.type] = [];
  for (const e of entities) (out[e.type] ||= []).push(e);
  return out;
}
