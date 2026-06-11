"use client";

// Firestore data layer for the Database (entities), trips, per-trip curation
// (membership + manual appearances), trip calendar secrets + cached itineraries,
// and the managed list of general areas. Confirmed appearances are NOT stored —
// they're computed live by matching a trip's calendar to the entities. Only
// manual planning (planned / Plan B), curation deltas, and dismissed conflicts
// are persisted here.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import type { EntityType, ItinDay } from "./entities";
import { DEFAULT_GENERAL_AREAS } from "./areas";
import { slugId } from "./slug";

export type Trip = {
  id: string;
  name: string;
  dateLabel?: string;
  areas: string[];
};

export type DBEntity = {
  id: string;
  name: string;
  type: EntityType;
  generalArea?: string;
  area?: string;
  address?: string;
  /** Street-level coordinates (from geocoding / Gemini enrichment). Falls back to neighborhood centroid when absent. */
  lat?: number;
  lng?: number;
  website?: string;
  /** Instagram profile URL or @handle (kept separate from the main website). */
  instagram?: string;
  hours?: string;
  price?: string;
  source?: string;
  booking?: string;
  notes?: string;
  closed?: boolean;
  bestDay?: string;
  /** Default booking requirement — instances can override per-occurrence. */
  needsBooking?: boolean;
  /** Set when this entity was auto-created from an unmatched calendar event and hasn't been manually reviewed. */
  calendarSource?: boolean;
  /** For party/event entities — links them to a parent club/venue entity. */
  parentId?: string;
};

export type StoredAppearance = {
  kind: "planned" | "planB";
  dayKey?: string;
  note?: string;
};

export type TripItem = {
  entityId: string;
  added?: boolean; // included despite region mismatch
  removed?: boolean; // explicitly removed from this trip
  appearances?: StoredAppearance[];
  dismissed?: string[]; // dismissed conflict keys
};

export type ItineraryCache = {
  tz: string;
  days: unknown[];
  syncedAt: string;
};

function requireDb(): Firestore {
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

// --- generic live subscription helper --------------------------------------

function subColl<T>(path: string, cb: (rows: T[]) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(collection(db, path), (snap) => cb(snap.docs.map((d) => d.data() as T)));
}

// --- entities (the Database) ------------------------------------------------

export const subscribeEntities = (cb: (e: DBEntity[]) => void) =>
  subColl<DBEntity>("entities", (rows) => cb(rows.filter((e) => e.name)));

export async function saveEntity(e: DBEntity): Promise<void> {
  await setDoc(doc(requireDb(), "entities", e.id), { ...e, updatedAt: serverTimestamp() }, { merge: true });
}

/** Saves an entity only if it doesn't already exist — protects manual edits from calendar re-sync. */
export async function saveEntityIfNew(e: DBEntity): Promise<void> {
  if (!db) return;
  const ref = doc(db, "entities", e.id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { ...e, updatedAt: serverTimestamp() });
  }
}

export async function deleteEntity(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "entities", id));
}

/** Bulk-set a single field on many entities (e.g. parking a selection into a bucket type). */
export async function bulkUpdateEntities(ids: string[], patch: Partial<DBEntity>): Promise<void> {
  const database = requireDb();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(database);
    for (const id of ids.slice(i, i + 400))
      batch.set(doc(database, "entities", id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  }
}

/** Bulk-delete many entities in one go (batched to respect Firestore's 500-op limit). */
export async function bulkDeleteEntities(ids: string[]): Promise<void> {
  const database = requireDb();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(database);
    for (const id of ids.slice(i, i + 400)) batch.delete(doc(database, "entities", id));
    await batch.commit();
  }
}

/**
 * Create-if-new for a batch of entities. Used to back-fill curated seed lists
 * (clubs, museums, hikes…) into an already-seeded Database without overwriting
 * any entity an admin has hand-edited. Returns how many were newly created.
 */
export async function seedEntitiesIfNew(entities: DBEntity[]): Promise<number> {
  if (!db) return 0;
  let created = 0;
  for (const e of entities) {
    const ref = doc(db, "entities", e.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...e, calendarSource: false, updatedAt: serverTimestamp() });
      created++;
    }
  }
  return created;
}

// --- trips ------------------------------------------------------------------

export const subscribeTrips = (cb: (t: Trip[]) => void) => subColl<Trip>("trips", cb);

export async function getTripDoc(id: string): Promise<Trip | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "trips", id));
  return snap.exists() ? (snap.data() as Trip) : null;
}

export async function saveTrip(t: Trip): Promise<void> {
  await setDoc(doc(requireDb(), "trips", t.id), t, { merge: true });
}

export async function deleteTrip(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "trips", id));
}

// --- per-trip curation (membership + manual appearances) --------------------

export const subscribeTripItems = (tripId: string, cb: (i: TripItem[]) => void) =>
  subColl<TripItem>(`tripEntities/${tripId}/items`, cb);

export async function saveTripItem(tripId: string, item: TripItem): Promise<void> {
  await setDoc(doc(requireDb(), `tripEntities/${tripId}/items`, item.entityId), item, { merge: true });
}

// --- trip calendar secret + cached itinerary --------------------------------

export async function getTripSecret(tripId: string): Promise<string | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "tripSecrets", tripId));
  return snap.exists() ? ((snap.data().icalUrl as string) ?? null) : null;
}

export async function saveTripSecret(tripId: string, icalUrl: string): Promise<void> {
  await setDoc(doc(requireDb(), "tripSecrets", tripId), { icalUrl });
}

export async function getItineraryCache(tripId: string): Promise<ItineraryCache | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "tripItineraries", tripId));
  return snap.exists() ? (snap.data() as ItineraryCache) : null;
}

export async function saveItineraryCache(tripId: string, cache: ItineraryCache): Promise<void> {
  await setDoc(doc(requireDb(), "tripItineraries", tripId), cache);
}

// --- calendar baseline (for the "what changed since last sync" report) ------
// A snapshot of the calendar as the admin last acknowledged it. Re-syncing diffs
// the fresh pull against this; "Mark as seen" overwrites it with the current pull.

export type CalendarBaseline = { days: ItinDay[]; syncedAt: string };

export async function getCalendarBaseline(): Promise<CalendarBaseline | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "meta", "calendarBaseline"));
  return snap.exists() ? (snap.data() as CalendarBaseline) : null;
}

export async function saveCalendarBaseline(b: CalendarBaseline): Promise<void> {
  await setDoc(doc(requireDb(), "meta", "calendarBaseline"), b);
}

// --- last CSV import log (so the result is reviewable after the dialog closes) -

export type ImportLogChange = { name: string; fields: string[] };
export type ImportLog = {
  at: string;
  updated: number;
  noChange: number;
  unmatched: number;
  skippedNoId: number;
  flagged: { name: string; field: string; value: string }[];
  samples: ImportLogChange[];
};

export async function getImportLog(): Promise<ImportLog | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "meta", "lastImport"));
  return snap.exists() ? (snap.data() as ImportLog) : null;
}

export async function saveImportLog(log: ImportLog): Promise<void> {
  await setDoc(doc(requireDb(), "meta", "lastImport"), log);
}

// --- managed general areas --------------------------------------------------

export async function getAreas(): Promise<string[]> {
  if (!db) return [...DEFAULT_GENERAL_AREAS];
  const snap = await getDoc(doc(db, "meta", "areas"));
  const list = snap.exists() ? (snap.data().list as string[]) : null;
  return list && list.length ? list : [...DEFAULT_GENERAL_AREAS];
}

export async function saveAreas(list: string[]): Promise<void> {
  await setDoc(doc(requireDb(), "meta", "areas"), { list });
}

// --- one-time seed ----------------------------------------------------------

export type SeedPayload = {
  trip: Trip;
  entities: DBEntity[];
  items: TripItem[];
  itinerary?: ItineraryCache;
};

/** Writes the initial Database, trip, curation and itinerary cache in batches. */
export async function seedDatabase(payload: SeedPayload): Promise<void> {
  const database = requireDb();
  const { trip, entities, items, itinerary } = payload;

  // Entities can exceed the 500-op batch limit when combined; chunk them.
  const chunks: DBEntity[][] = [];
  for (let i = 0; i < entities.length; i += 400) chunks.push(entities.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(database);
    for (const e of chunk) batch.set(doc(database, "entities", e.id), e, { merge: true });
    await batch.commit();
  }

  await setDoc(doc(database, "trips", trip.id), trip, { merge: true });

  const itemChunks: TripItem[][] = [];
  for (let i = 0; i < items.length; i += 400) itemChunks.push(items.slice(i, i + 400));
  for (const chunk of itemChunks) {
    const batch = writeBatch(database);
    for (const it of chunk)
      batch.set(doc(database, `tripEntities/${trip.id}/items`, it.entityId), it, { merge: true });
    await batch.commit();
  }

  if (itinerary) await saveItineraryCache(trip.id, itinerary);

  await setDoc(doc(database, "meta", "seeded"), { at: serverTimestamp(), trip: trip.id });
}

export async function isSeeded(): Promise<boolean> {
  if (!db) return false;
  const snap = await getDoc(doc(db, "meta", "seeded"));
  return snap.exists();
}

// --- instances (per-occurrence overrides: lock / edit / remove) ------------

export type Instance = {
  id: string; // = calendar UID for calendar-derived occurrences
  tripId: string;
  entityId?: string;
  removed?: boolean;
  title?: string;
  /** Snapshot captured on lock so the occurrence survives calendar deletion. */
  dayKey?: string;
  startMs?: number;
  time?: string;

  // --- Schedule level (the calendar event occurrence) ---
  /** Locks the schedule card: orphan-survival + protects scheduleNote from re-sync. */
  scheduleLocked?: boolean;
  /** Merged note: calendar description prepended on first lock, then freely editable. */
  scheduleNote?: string;

  // --- Entity instance level (only when entityId is set) ---
  /** Can be toggled independently after schedule lock. */
  entityInstanceLocked?: boolean;
  /** Notes specific to this visit to the place. */
  entityInstanceNote?: string;
  /** Booking state — null means inherit the entity's needsBooking default. */
  needsBooking?: boolean | null;
  booked?: boolean;
  bookingNote?: string;
  /** "Book this many days before the trip starts." */
  bookingOffsetDays?: number;
};

export const subscribeInstances = (tripId: string, cb: (i: Instance[]) => void) =>
  subColl<Instance>(`tripInstances/${tripId}/items`, cb);

export async function saveInstance(tripId: string, instance: Instance): Promise<void> {
  await setDoc(doc(requireDb(), `tripInstances/${tripId}/items`, instance.id), instance, {
    merge: true,
  });
}

export async function deleteInstanceOverride(tripId: string, id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), `tripInstances/${tripId}/items`, id));
}

// --- comments (per instance/appearance) ------------------------------------

export type Comment = {
  id: string;
  /** Set for entity-instance-level comments (about a specific visit). */
  instanceId?: string;
  /** Set for entity-level comments (about the place in general). */
  entityId?: string;
  text: string;
  authorName: string;
  authorEmail: string;
  createdAt?: { seconds: number } | null;
};

export function subscribeComments(instanceId: string, cb: (c: Comment[]) => void): () => void {
  if (!db) return () => {};
  const q = query(collection(db, "comments"), where("instanceId", "==", instanceId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }));
    rows.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    cb(rows);
  });
}

export async function addComment(
  instanceId: string,
  text: string,
  authorName: string,
  authorEmail: string
): Promise<void> {
  await addDoc(collection(requireDb(), "comments"), {
    instanceId,
    text,
    authorName,
    authorEmail,
    createdAt: serverTimestamp(),
  });
}

export async function deleteComment(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "comments", id));
}

export function subscribeEntityComments(entityId: string, cb: (c: Comment[]) => void): () => void {
  if (!db) return () => {};
  const q = query(collection(db, "comments"), where("entityId", "==", entityId));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }));
    rows.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    cb(rows);
  });
}

export async function addEntityComment(
  entityId: string,
  text: string,
  authorName: string,
  authorEmail: string
): Promise<void> {
  await addDoc(collection(requireDb(), "comments"), {
    entityId,
    text,
    authorName,
    authorEmail,
    createdAt: serverTimestamp(),
  });
}

// --- dismissed sync issues (admin) -----------------------------------------

export function subscribeDismissedIssues(cb: (keys: string[]) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(doc(db, "meta", "dismissedIssues"), (snap) => {
    cb(snap.exists() ? ((snap.data().keys as string[]) ?? []) : []);
  });
}

export async function setDismissedIssues(keys: string[]): Promise<void> {
  await setDoc(doc(requireDb(), "meta", "dismissedIssues"), { keys });
}

/**
 * One-time migration: delete known verbose duplicate entities (auto-saved
 * calendar event titles that shadow real seed entities) and fix known wrong
 * entity types created when the categorizer was less accurate.
 */
export async function runDeduplicationMigration(): Promise<{ deleted: number; fixed: number }> {
  if (!db) return { deleted: 0, fixed: 0 };

  // Verbose calendar-title duplicates that shadow real seed entities,
  // plus "Grab X at Y" entities saved before the name extractor was fixed.
  const toDelete = [
    slugId("museum", "Met Cloisters & Fort Tryon Walk"),
    slugId("museum", "MASS MoCA Exhibition"),
    slugId("museum", "New Museum LES & Gallery Walk"),
    slugId("club", "FIST 10 Year Anniversary @ Basement"),
    slugId("club", "Mister Sunday: Soul Summit Takeover"),
    slugId("club", "Sultan Rooms or Pure Honey Pride & & 3DB Black Market Marathon"),
    slugId("sight", "Jacob Riis Park Queer Beach"),
    slugId("sight", "Coney Island Mermaid Parade"),
    slugId("club", "Bushwick Comedy Club, 259 Melrose St or BCC at Eris Bar"),
    slugId("club", "LadyLand Festival"),
    // "Grab X at Y" entities saved before extractPlaceName handled this pattern
    slugId("food", "Grab Coffee at Cornwall Coffee Co. & Mercantile"),
    slugId("food", "Grab food at Downstate Newburgh"),
  ];

  // Entities saved with wrong types by the old (less accurate) categorizer.
  const toFix: { id: string; type: EntityType }[] = [
    { id: slugId("party", "Pre-FIST Dedicated Nap Window"), type: "admin" },
    { id: slugId("sight", "Hersheypark Morning Coaster Block"), type: "attraction" },
    { id: slugId("sight", "Rental Car Pickup & Storm King Drive"), type: "travel" },
    { id: slugId("food", "Casual Lunch en Route South"), type: "travel" },
    { id: slugId("event", "Ladyland"), type: "party" },
    { id: slugId("event", "Mermaid Parade"), type: "sight" },
  ];

  const database = requireDb();

  // Fetch toFix docs to decide per-doc: retype real entities, delete nameless
  // stubs (created by a previous bad set+merge run), skip non-existent ones.
  const fixRefs = toFix.map(({ id }) => doc(database, "entities", id));
  const fixSnaps = await Promise.all(fixRefs.map((r) => getDoc(r)));

  const batch = writeBatch(database);
  let deleted = 0;
  let fixed = 0;

  for (const id of toDelete) {
    batch.delete(doc(database, "entities", id));
    deleted++;
  }
  for (let i = 0; i < toFix.length; i++) {
    const snap = fixSnaps[i];
    if (!snap.exists()) continue; // nothing to do
    if (snap.data()?.name) {
      // Real entity → retype it.
      batch.update(fixRefs[i], { type: toFix[i].type, updatedAt: serverTimestamp() });
      fixed++;
    } else {
      // Nameless stub from the bad migration → remove it.
      batch.delete(fixRefs[i]);
      deleted++;
    }
  }

  await batch.commit();
  return { deleted, fixed };
}
