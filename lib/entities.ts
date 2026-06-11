// Unified entity model. Every planning "thing" — a restaurant, museum, party,
// hike, shop, accommodation — becomes an Entity with well-defined attributes
// plus the trip-slots that say where/when it appears (Confirmed from the
// calendar, Planned/Plan B from the lists). The calendar is the master for the
// schedule, so planned slots that disagree with a confirmed one are flagged.

import {
  restaurants,
  vintage,
  museums,
  clubs,
  spas,
  sights,
  hikes,
  attractions,
  events,
  type Restaurant,
  type VintageShop,
  type SeedPlace,
} from "./planning";
import { suggestGeneralArea } from "./areas";
import { slugId } from "./slug";

/** Curated place lists, each tagged with the EntityType its file represents. */
const SEED_GROUPS: { type: EntityType; places: SeedPlace[] }[] = [
  { type: "museum", places: museums },
  { type: "club", places: clubs },
  { type: "spa", places: spas },
  { type: "sight", places: sights },
  { type: "hike", places: hikes },
  { type: "attraction", places: attractions },
  { type: "event", places: events },
];

/** Build a plain Entity (no slots) from a curated seed place. Parties get a parentId. */
function seedToEntity(p: SeedPlace, groupType: EntityType, tz: string): Entity {
  const type = p.type ?? groupType;
  return {
    id: slugId(type, p.name),
    name: p.name,
    type,
    generalArea: suggestGeneralArea(p.generalArea, p.area, p.address, p.name),
    area: p.area,
    address: p.address,
    website: p.website,
    hours: p.hours,
    price: p.price,
    booking: p.booking,
    notes: p.notes,
    bestDay: p.bestDay,
    parentId: p.parent ? slugId("club", p.parent) : undefined,
    slots: parsePlannedSlots(p.bestDay ?? "", tz),
  };
}

/**
 * The curated places (clubs, museums, sights, hikes, spas, attractions, events)
 * as Database-ready entities — for seeding a fresh DB or back-filling an existing
 * one without clobbering manual edits (create-if-new at the call site).
 */
export function buildCuratedSeedEntities(): DBEntity[] {
  const out: DBEntity[] = [];
  for (const g of SEED_GROUPS) for (const p of g.places) out.push(toDBEntity(seedToEntity(p, g.type, "UTC")));
  return out;
}

export type EntityType =
  | "food"
  | "vintage"
  | "museum"
  | "club"
  | "party"   // legacy — kept for existing Firestore docs; displayed under Clubs tab
  | "spa"
  | "sight"
  | "attraction"
  | "hike"
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
  { type: "spa", label: "Spa", emoji: "🧖" },
  { type: "sight", label: "Sights", emoji: "📸" },
  { type: "attraction", label: "Attractions", emoji: "🎢" },
  { type: "hike", label: "Hikes", emoji: "🥾" },
  { type: "event", label: "Events", emoji: "🎫" },
  { type: "accommodation", label: "Stays", emoji: "🛏" },
  { type: "travel", label: "Travel", emoji: "✈️", operational: true },
  { type: "admin", label: "Admin", emoji: "📋", operational: true },
  { type: "uncategorised", label: "Uncategorised", emoji: "❓" },
];

/** Types that are trip-operational (not place-based) — hidden by default in Database and Planning. */
export const OPERATIONAL_TYPES = new Set<EntityType>(["travel", "admin"]);

export type SlotKind = "confirmed" | "planned" | "planB";

export type TripSlot = {
  kind: SlotKind;
  dayKey?: string;
  label: string;
  /** Time-of-day, when known (e.g. "6:00 PM"). Shown distinctly from the day. */
  time?: string;
  /** Epoch ms of the event start — stored in lock snapshot so orphan can survive calendar deletion. */
  startMs?: number;
  note?: string;
  mismatch?: boolean;
  /** Source calendar event uid, for confirmed slots — lets the itinerary link. */
  uid?: string;
  /** App-owned (locked) — the calendar no longer overrides this occurrence. */
  locked?: boolean;
};

export type Entity = {
  id: string;
  name: string;
  type: EntityType;
  generalArea?: string;
  area?: string;
  address?: string;
  /** Street-level coordinates. When present the map uses them instead of a neighborhood centroid. */
  lat?: number;
  lng?: number;
  website?: string;
  hours?: string;
  price?: string;
  source?: string;
  booking?: string;
  notes?: string;
  closed?: boolean;
  bestDay?: string;
  /** Default booking requirement for this place. Instances can override per-occurrence. */
  needsBooking?: boolean;
  /** True when derived from a calendar event not yet saved in the Database. */
  transient?: boolean;
  /** Links this entity to a parent venue (e.g. a party → its club). */
  parentId?: string;
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
  /** True when injected from a locked instance whose calendar event was deleted. */
  orphaned?: boolean;
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

/** Split "A or B or C" into trimmed parts. Returns [whole] if no " or " found. */
function splitOrParts(summary: string): string[] {
  return summary.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
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
    return "club";
  if (/\b(hike|trail|falls|mountain|greylock|cascade|kaaterskill)\b/.test(t)) return "hike";
  // spa/banya before general sights so they don't land in the wrong bucket
  if (/\b(banya|spa|bathhouse|sauna|hammam|onsen)\b/.test(t)) return "spa";
  // fun attractions (theme/amusement/water parks) — distinct from museums and sights
  if (/\b(hersheypark|chocolate world|theme park|amusement park|water park|roller coaster|luna park|six flags)\b/.test(t))
    return "attraction";
  if (/\b(high line|coney|boardwalk|beach|riis|mermaid parade)\b/.test(t)) return "sight";
  // travel & admin checked before food — "Rental Car Pickup", "Return", "En Route" etc.
  if (
    /\b(flight|train|amtrak|greyhound|megabus|ferry|coach|transit|airport|depart|departure|arrival|arrive|car\s+rental|rental\s+car|drive\s+to|bus\s+to|en\s+route|return\s+to|heading\s+to)\b/.test(
      t
    )
  )
    return "travel";
  if (
    /\b(check.?in|check.?out|insurance|visa|currency|packing|pick.?up|drop.?off|confirmation|reservation|passport|admin|logistics)\b/.test(
      t
    )
  )
    return "admin";
  if (/\b(dinner|brunch|lunch|breakfast|cafe|coffee|food|bagel|pizza|bites|bbq|deli|snack|eat)\b/.test(t))
    return "food";
  // genuine one-off events (festivals, parades) are seeded/curated as "event";
  // anything the classifier can't place falls through to the explicit catch-all.
  return "uncategorised";
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
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip common verb phrases from a calendar title so the place name can be
 * extracted cleanly. "Go to Met Cloisters" → "Met Cloisters".
 */
const PLACE_PREFIX_RE =
  /^(?:go(?:ing)?(?:\s+to)?|visit(?:ing)?|see(?:ing)?|tour(?:ing)?|explore(?:ing)?|check(?:ing)?\s+(?:in|out)(?:\s+(?:at|to))?|head(?:ing)?\s+to|get(?:ting)?\s+to|travel(?:ing)?\s+to|drive\s+to|walk(?:ing)?\s+to|fly(?:ing)?\s+to|(?:dinner|lunch|breakfast|brunch|drinks?|coffee)\s+(?:at|@)|meet(?:ing)?(?:\s+(?:at|@))?)\s+/i;

export function extractPlaceName(summary: string): string {
  return cleanName(summary).replace(PLACE_PREFIX_RE, "").trim();
}

function matchesEntity(entityName: string, e: ItinEvent): boolean {
  const n = normLoose(entityName);
  if (n.length < 4) return false;
  // Check location first (most precise), then the extracted place name, then full summary.
  const loc = normLoose(e.location ?? "");
  if (loc && loc.includes(n)) return true;
  const extracted = normLoose(extractPlaceName(e.summary));
  if (extracted.includes(n)) return true;
  // Allow full-summary match only if entity name is reasonably specific (7+ chars)
  // to prevent short names ("Met") from matching unrelated events.
  return n.length >= 7 && normLoose(e.summary).includes(n);
}

// --- shared slot helpers ---------------------------------------------------

function flatten(days: ItinDay[]): { allEvents: ItinEvent[]; dayKeyOf: Map<string, string> } {
  const allEvents = days.flatMap((d) => d.events);
  const dayKeyOf = new Map<string, string>();
  for (const d of days) for (const e of d.events) dayKeyOf.set(e.uid, d.dayKey);
  return { allEvents, dayKeyOf };
}

function confirmedSlot(e: ItinEvent, dayKeyOf: Map<string, string>, tz: string): TripSlot {
  const dk = dayKeyOf.get(e.uid)!;
  const time = timeOf(e, tz);
  return { kind: "confirmed", dayKey: dk, label: slotDayLabel(dk, tz, time), time, startMs: e.startMs, uid: e.uid };
}

/** Merge planned slots onto confirmed ones, flagging genuine disagreements. */
function attachSlots(planned: TripSlot[], confirmed: TripSlot[], dismissed?: Set<string>): TripSlot[] {
  const confirmedDays = new Set(confirmed.map((s) => s.dayKey).filter(Boolean));
  const keptPlanned = planned
    .filter((p) => !(p.dayKey && confirmedDays.has(p.dayKey))) // agrees → already shown
    .map((p) => {
      const isMismatch = !!(p.dayKey && confirmedDays.size > 0);
      if (isMismatch && dismissed?.has(conflictKey(p))) return p; // acknowledged
      return isMismatch ? { ...p, mismatch: true } : p;
    });
  return [...confirmed, ...keptPlanned];
}

/** Stable key for a (planned) slot so a dismissed conflict can be remembered. */
export function conflictKey(s: TripSlot): string {
  return `${s.kind}:${s.dayKey ?? ""}:${s.note ?? ""}`;
}

// --- the builder (bundled seed data + calendar) ----------------------------

export function buildEntities(days: ItinDay[], tz: string): Entity[] {
  const { allEvents, dayKeyOf } = flatten(days);
  const matchedUids = new Set<string>();
  const entities: Entity[] = [];
  const conf = (e: ItinEvent) => confirmedSlot(e, dayKeyOf, tz);

  // 1) Food entities (list-backed)
  for (const r of restaurants as Restaurant[]) {
    const confirmed = allEvents.filter((e) => matchesEntity(r.name, e));
    confirmed.forEach((e) => matchedUids.add(e.uid));
    entities.push({
      id: "food:" + r.name,
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
      slots: attachSlots(parsePlannedSlots(r.days, tz), confirmed.map(conf)),
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
      generalArea: suggestGeneralArea(v.address, v.area),
      area: v.area,
      address: v.address,
      hours: v.hours,
      price: v.price,
      notes: v.vibe,
      bestDay: v.bestDay,
      slots: attachSlots(parsePlannedSlots(v.bestDay, tz), confirmed.map(conf)),
    });
  }

  // 2.5) Curated places (clubs, museums, sights, hikes, spas, attractions, events)
  for (const g of SEED_GROUPS) {
    for (const p of g.places) {
      const base = seedToEntity(p, g.type, tz);
      const confirmed = allEvents.filter((e) => matchesEntity(base.name, e));
      confirmed.forEach((e) => matchedUids.add(e.uid));
      entities.push({ ...base, slots: attachSlots(base.slots, confirmed.map(conf)) });
    }
  }

  // 3) Accommodation entities (multi-day stays), deduped by name
  for (const s of collectStays(days)) {
    entities.push({
      id: "stay:" + s.summary,
      name: s.summary,
      type: "accommodation",
      generalArea: suggestGeneralArea(s.location, s.summary),
      address: s.location,
      slots: [{ kind: "confirmed", dayKey: s.allDayStart, label: stayLabel(s, tz) }],
    });
  }

  // 4) Remaining calendar events → categorized entities, grouped by extracted place name
  for (const group of groupUnmatched(allEvents, matchedUids, dayKeyOf, tz)) {
    const first = group.events[0];
    entities.push({
      id: "cal:" + group.type + ":" + norm(group.name),
      name: group.name,
      type: group.type,
      generalArea: suggestGeneralArea(first.location) ?? suggestGeneralArea(group.name),
      address: first.location,
      notes: first.description,
      slots: [...group.events.map(conf), ...group.altSlots],
    });
  }

  return entities;
}

function collectStays(days: ItinDay[]): ItinEvent[] {
  const stays = new Map<string, ItinEvent>();
  for (const d of days) for (const s of d.basedIn) if (!stays.has(s.summary)) stays.set(s.summary, s);
  return [...stays.values()];
}

function stayLabel(s: ItinEvent, tz: string): string {
  return s.allDayStart && s.allDayEnd
    ? `${slotDayLabel(s.allDayStart, tz)} → ${slotDayLabel(addDays(s.allDayEnd, -1), tz)}`
    : "Stay";
}

function groupUnmatched(
  allEvents: ItinEvent[],
  matchedUids: Set<string>,
  dayKeyOf: Map<string, string>,
  tz: string
) {
  const byKey = new Map<
    string,
    { name: string; type: EntityType; events: ItinEvent[]; altSlots: TripSlot[] }
  >();

  const getOrAdd = (key: string, name: string, type: EntityType) => {
    if (!byKey.has(key)) byKey.set(key, { name, type, events: [], altSlots: [] });
    return byKey.get(key)!;
  };

  for (const e of allEvents) {
    if (matchedUids.has(e.uid)) continue;
    const parts = splitOrParts(e.summary);

    if (parts.length > 1) {
      // Primary part → confirmed slot
      const primaryName = extractPlaceName(parts[0]);
      const primaryType = categorizeEvent({ ...e, summary: parts[0] });
      getOrAdd(primaryType + ":" + norm(primaryName), primaryName, primaryType).events.push(e);

      // Alternative parts → planB slots (same day/time, no calendar UID)
      const dk = dayKeyOf.get(e.uid);
      const time = timeOf(e, tz);
      for (let i = 1; i < parts.length; i++) {
        const altName = extractPlaceName(parts[i]);
        const altType = categorizeEvent({ ...e, summary: parts[i] });
        const altKey = altType + ":" + norm(altName);
        const group = getOrAdd(altKey, altName, altType);
        if (dk) {
          group.altSlots.push({
            kind: "planB",
            dayKey: dk,
            label: slotDayLabel(dk, tz, time),
            time,
            startMs: e.startMs,
            note: `Alternative to ${extractPlaceName(parts[0])}`,
          });
        }
      }
    } else {
      // No "or" — normal grouping by extracted place name
      const placeName = extractPlaceName(e.summary);
      const type = categorizeEvent(e);
      getOrAdd(type + ":" + norm(placeName), placeName, type).events.push(e);
    }
  }

  return [...byKey.values()];
}

// --- DB seed + per-trip resolution -----------------------------------------

import type { DBEntity, TripItem, StoredAppearance, Instance } from "./db";

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

/** Build the one-time seed payload from the bundled-derived entities. */
export function buildSeed(built: Entity[]): { entities: DBEntity[]; items: TripItem[] } {
  const entities: DBEntity[] = [];
  const items: TripItem[] = [];
  for (const e of built) {
    const dbId = slugId(e.type, e.name);
    entities.push(toDBEntity(e));
    const appearances: StoredAppearance[] = e.slots
      .filter((s) => s.kind === "planned" || s.kind === "planB")
      .map((s) => ({ kind: s.kind as "planned" | "planB", dayKey: s.dayKey, note: s.note }));
    if (appearances.length) items.push({ entityId: dbId, appearances });
  }
  return { entities, items };
}

function dbToEntity(de: DBEntity): Entity {
  return { ...de, needsBooking: de.needsBooking, slots: [] };
}

/**
 * Resolve a trip's entities from the Database + curation. Membership: an entity
 * is in the trip if its region is one of the trip's areas (and not removed), or
 * it was explicitly added. Confirmed appearances are computed live from the
 * trip's calendar; planned/Plan B come from stored curation. Calendar events
 * matching no included entity surface as transient (not-yet-in-database) items.
 */
export function resolveTripEntities(opts: {
  dbEntities: DBEntity[];
  items: TripItem[];
  days: ItinDay[];
  tz: string;
  tripAreas: string[];
  instances?: Instance[];
}): Entity[] {
  const { dbEntities, items, days, tz, tripAreas, instances = [] } = opts;
  const itemBy = new Map(items.map((i) => [i.entityId, i]));
  const overrideBy = new Map(instances.map((i) => [i.id, i]));
  const areaSet = new Set(tripAreas);
  const { allEvents, dayKeyOf } = flatten(days);
  const matchedUids = new Set<string>();
  const out: Entity[] = [];
  // Apply per-occurrence overrides: drop removed, mark locked, override note.
  const conf = (e: ItinEvent): TripSlot => {
    const s = confirmedSlot(e, dayKeyOf, tz);
    const ov = overrideBy.get(e.uid);
    if (ov?.entityInstanceLocked) s.locked = true;
    if (ov?.entityInstanceNote) s.note = ov.entityInstanceNote;
    return s;
  };
  const isRemoved = (e: ItinEvent) => overrideBy.get(e.uid)?.removed === true;

  for (const de of dbEntities) {
    const item = itemBy.get(de.id);
    const inByArea = de.generalArea ? areaSet.has(de.generalArea) : false;
    const included = item?.added || (inByArea && !item?.removed);

    const confirmed = allEvents.filter((e) => matchesEntity(de.name, e) && !isRemoved(e));
    // Only consume calendar events for entities actually in the trip.
    if (!included && confirmed.length === 0) continue;
    confirmed.forEach((e) => matchedUids.add(e.uid));
    if (!included) continue;

    const stored: TripSlot[] = (item?.appearances ?? []).map((a) => ({
      kind: a.kind,
      dayKey: a.dayKey,
      label: a.dayKey ? slotDayLabel(a.dayKey, tz) : a.kind === "planB" ? "Plan B" : "Flexible",
      note: a.note,
    }));
    const dismissed = new Set(item?.dismissed ?? []);
    out.push({ ...dbToEntity(de), slots: attachSlots(stored, confirmed.map(conf), dismissed) });
  }

  // Removed occurrences shouldn't resurface as transient items either.
  for (const e of allEvents) if (isRemoved(e)) matchedUids.add(e.uid);

  // Transient: scheduled events matching nothing in the Database yet.
  for (const group of groupUnmatched(allEvents, matchedUids, dayKeyOf, tz)) {
    const first = group.events[0];
    out.push({
      id: "new:" + group.type + ":" + norm(group.name),
      name: group.name,
      type: group.type,
      generalArea: suggestGeneralArea(first.location) ?? suggestGeneralArea(group.name),
      address: first.location,
      notes: first.description,
      transient: true,
      slots: [...group.events.map(conf), ...group.altSlots],
    });
  }

  return out;
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

// --- admin sync / conflict report ------------------------------------------

import { resolvePoint } from "./geo";

export type IssueSeverity = "conflict" | "warning" | "info";
export type SyncIssue = {
  severity: IssueSeverity;
  kind: string;
  entity: string;
  detail: string;
};

/**
 * Collects everything the auto-import couldn't cleanly resolve so an admin can
 * review and act: plan-vs-calendar conflicts, closed venues still in the plan,
 * scheduled places that won't map, and low-confidence categorizations.
 */
export function buildSyncReport(entities: Entity[]): SyncIssue[] {
  const issues: SyncIssue[] = [];
  for (const e of entities) {
    const inTrip = e.slots.length > 0;
    const isConfirmed = e.slots.some((s) => s.kind === "confirmed");

    for (const s of e.slots) {
      if (s.mismatch) {
        issues.push({
          severity: "conflict",
          kind: "Plan differs from calendar",
          entity: e.name,
          detail: `Your plan says "${s.note ?? s.label}" but the calendar has no matching event that day.`,
        });
      }
    }

    if (e.closed && inTrip) {
      issues.push({
        severity: "conflict",
        kind: "Closed venue in plan",
        entity: e.name,
        detail: `${e.name} is permanently closed but still appears in the plan.`,
      });
    }

    // Mirror the map's resolution order: exact coords → address → area → name.
    const mappable =
      (typeof e.lat === "number" && typeof e.lng === "number") ||
      resolvePoint(e.address, e.id) ||
      resolvePoint(e.area, e.id) ||
      resolvePoint(e.name, e.id);
    if (isConfirmed && !mappable) {
      issues.push({
        severity: "warning",
        kind: "Won't show on map",
        entity: e.name,
        detail: `Scheduled, but its location couldn't be placed on the map${
          e.address ? ` ("${e.address}")` : ""
        }.`,
      });
    }

    if (e.type === "uncategorised" && isConfirmed) {
      issues.push({
        severity: "info",
        kind: "Uncategorised",
        entity: e.name,
        detail: `The classifier couldn't place this — it landed in the catch-all. You may want to recategorise it.`,
      });
    }
  }

  const order: IssueSeverity[] = ["conflict", "warning", "info"];
  return issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

/** Map each calendar event uid to the entity (and its slot) it resolved to. */
export function indexByEventUid(entities: Entity[]): Map<string, { entity: Entity; slot: TripSlot }> {
  const map = new Map<string, { entity: Entity; slot: TripSlot }>();
  for (const e of entities) {
    for (const s of e.slots) {
      if (s.uid) map.set(s.uid, { entity: e, slot: s });
    }
  }
  return map;
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
