// Calendar ↔ Database sync diff engine.
// Takes a frozen snapshot of calendar days + current DB state and returns a
// classified list of SyncItems so the admin can review and act before anything
// is committed to Firestore.

import type { DBEntity, TripItem } from "./db";
import type { ItinDay, EntityType } from "./entities";
import { extractPlaceName, categorizeEvent, PARKED_TYPES } from "./entities";

// --- internal normalizer (mirrors matchesEntity logic in entities.ts) --------

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- types -------------------------------------------------------------------

export type SyncCalEvent = {
  uid: string;
  summary: string;
  extractedName: string;
  type: EntityType;
  location?: string;
  description?: string;
  dayKey: string;
};

export type SyncItem =
  | { status: "matched"; entity: DBEntity; events: SyncCalEvent[] }
  | { status: "new"; event: SyncCalEvent }
  | { status: "fuzzy"; event: SyncCalEvent; candidate: DBEntity; score: number }
  | { status: "type_changed"; entity: DBEntity; calType: EntityType; event: SyncCalEvent }
  | { status: "orphaned"; entity: DBEntity; expected: boolean };

// --- matching helpers --------------------------------------------------------

function entityMatchesEvent(entityName: string, e: SyncCalEvent): boolean {
  const n = norm(entityName);
  if (n.length < 4) return false;
  if (e.location && norm(e.location).includes(n)) return true;
  if (norm(e.extractedName).includes(n)) return true;
  return n.length >= 7 && norm(e.summary).includes(n);
}

/**
 * party is a legacy synonym of club in this app (kept for stored Firestore docs).
 * The calendar parser always emits "club", so treat the pair as equivalent to
 * avoid false type-mismatch flags on every party-typed entity.
 */
function entityTypesEquivalent(a: EntityType, b: EntityType): boolean {
  if (a === b) return true;
  const canonical = (t: EntityType) => (t === "party" ? "club" : t);
  return canonical(a) === canonical(b);
}

function fuzzyScore(a: string, b: string): number {
  const wa = norm(a).split(" ").filter((w) => w.length > 3);
  const wb = norm(b).split(" ").filter((w) => w.length > 3);
  if (!wa.length || !wb.length) return 0;
  return wa.filter((w) => wb.includes(w)).length / Math.max(wa.length, wb.length);
}

// --- description cleaner (shared with TripData auto-save) -------------------

export function cleanCalendarDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/(?:meet\.google\.com|zoom\.us|us\d+\.zoom\.us)\/\S*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
  return cleaned || undefined;
}

// --- main diff function ------------------------------------------------------

export function buildSyncDiff(opts: {
  days: ItinDay[];
  dbEntities: DBEntity[];
  items: TripItem[];
  tripAreas: string[];
}): SyncItem[] {
  const { days, dbEntities, items, tripAreas } = opts;
  const itemBy = new Map(items.map((i) => [i.entityId, i]));
  const areaSet = new Set(tripAreas);

  const allEvents: SyncCalEvent[] = days.flatMap((d) =>
    d.events.map((e) => ({
      uid: e.uid,
      summary: e.summary,
      extractedName: extractPlaceName(e.summary),
      type: categorizeEvent(e),
      location: e.location,
      description: e.description,
      dayKey: d.dayKey,
    }))
  );

  const matchedUids = new Set<string>();
  const matchedEntityIds = new Set<string>();
  const result: SyncItem[] = [];

  // Phase 1: match DB entities (in this trip) to their calendar events
  for (const de of dbEntities) {
    const item = itemBy.get(de.id);
    const inByArea = de.generalArea ? areaSet.has(de.generalArea) : false;
    if (!(item?.added || (inByArea && !item?.removed))) continue;

    // Exclude logistics-classified events (travel/admin) from matching against
    // place entities. "Pre-FIST Nap Window" categorises as admin; we don't want
    // FIST (club) to match it and get flagged as a type mismatch.
    const matched = allEvents.filter(
      (e) => !PARKED_TYPES.has(e.type) && entityMatchesEvent(de.name, e)
    );
    if (!matched.length) continue;

    matched.forEach((e) => matchedUids.add(e.uid));
    matchedEntityIds.add(de.id);

    // A deliberately parked entity (Travel / Admin / Misc) overrides the parser's
    // guess — don't nag about a "mismatch" the admin already resolved on purpose.
    // Also skip when:
    //  • calType is "uncategorised" — parser gave up, so trust the DB type.
    //  • types are synonyms (party ↔ club).
    const calType = matched[0].type;
    const isMismatch =
      !entityTypesEquivalent(calType, de.type) &&
      !PARKED_TYPES.has(de.type) &&
      calType !== "uncategorised";
    if (isMismatch) {
      result.push({ status: "type_changed", entity: de, calType, event: matched[0] });
    } else {
      result.push({ status: "matched", entity: de, events: matched });
    }
  }

  // Phase 2: unmatched calendar events → fuzzy or new
  for (const e of allEvents) {
    if (matchedUids.has(e.uid)) continue;
    let best: { entity: DBEntity; score: number } | null = null;
    for (const de of dbEntities) {
      const score = fuzzyScore(e.extractedName, de.name);
      if (score >= 0.5 && (!best || score > best.score)) best = { entity: de, score };
    }
    if (best) {
      result.push({ status: "fuzzy", event: e, candidate: best.entity, score: best.score });
    } else {
      result.push({ status: "new", event: e });
    }
  }

  // Phase 3: trip entities with no calendar match → orphaned.
  // `expected` = we'd genuinely expect a calendar event for this (it was either
  // explicitly added to the trip, or auto-imported from the calendar before).
  // The opposite — a curated place that's only in the trip because its area
  // matches — is just a candidate you haven't scheduled yet, not a problem.
  for (const de of dbEntities) {
    if (matchedEntityIds.has(de.id)) continue;
    const item = itemBy.get(de.id);
    const inByArea = de.generalArea ? areaSet.has(de.generalArea) : false;
    if (item?.added || (inByArea && !item?.removed)) {
      const expected = !!(item?.added || de.calendarSource);
      result.push({ status: "orphaned", entity: de, expected });
    }
  }

  return result;
}
