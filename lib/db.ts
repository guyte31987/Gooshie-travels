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
import type { EntityType } from "./entities";
import { DEFAULT_GENERAL_AREAS } from "./areas";
import { slugId } from "./slug";

export type TripStay = { name: string; from: string; to: string; address?: string };

export type Trip = {
  id: string;
  name: string;
  dateLabel?: string;
  areas: string[];
  stays?: TripStay[];
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
  /** Firebase Storage download URLs for entity photos. */
  photos?: string[];
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

export function subscribeTripDoc(tripId: string, cb: (t: Trip | null) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(doc(db, "trips", tripId), (snap) => cb(snap.exists() ? (snap.data() as Trip) : null));
}

export async function saveTripStays(tripId: string, stays: TripStay[]): Promise<void> {
  await setDoc(doc(requireDb(), "trips", tripId), { stays }, { merge: true });
}

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
};

/** Writes the initial Database, trip and curation in batches. */
export async function seedDatabase(payload: SeedPayload): Promise<void> {
  const database = requireDb();
  const { trip, entities, items } = payload;

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

  await setDoc(doc(database, "meta", "seeded"), { at: serverTimestamp(), trip: trip.id });
}

export async function isSeeded(): Promise<boolean> {
  if (!db) return false;
  const snap = await getDoc(doc(db, "meta", "seeded"));
  return snap.exists();
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
  /** Optional single photo attached to this comment. */
  photoUrl?: string;
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
  authorEmail: string,
  photoUrl?: string
): Promise<void> {
  await addDoc(collection(requireDb(), "comments"), {
    instanceId,
    text,
    authorName,
    authorEmail,
    createdAt: serverTimestamp(),
    ...(photoUrl ? { photoUrl } : {}),
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
  authorEmail: string,
  photoUrl?: string
): Promise<void> {
  await addDoc(collection(requireDb(), "comments"), {
    entityId,
    text,
    authorName,
    authorEmail,
    createdAt: serverTimestamp(),
    ...(photoUrl ? { photoUrl } : {}),
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

  // batch.delete on a non-existent doc is a silent no-op, so we can safely try every
  // plausible type prefix for each verbose entity. The auto-saver used whatever type
  // categorizeEvent returned at the time — which may differ from what we'd expect now.
  const ids = (...names: string[]) =>
    (types: EntityType[], ...extra: string[]) =>
      [...types, ...extra as EntityType[]].flatMap((t) =>
        names.map((n) => slugId(t, n))
      );

  const PLACE_TYPES: EntityType[] = ["club", "party", "event", "sight", "attraction", "museum"];
  const FOOD_TYPES: EntityType[] = ["food", "uncategorised"];

  const toDelete: string[] = [
    // Museums with verbose calendar titles
    ...ids("Met Cloisters & Fort Tryon Walk")(["museum", "sight", "attraction"]),
    ...ids("MASS MoCA Exhibition")(["museum", "sight", "attraction"]),
    ...ids("New Museum LES & Gallery Walk")(["museum", "sight", "attraction"]),
    // Club/party events with verbose calendar titles
    ...ids("FIST 10 Year Anniversary @ Basement")(PLACE_TYPES),
    ...ids("Mister Sunday: Soul Summit Takeover")(PLACE_TYPES),
    ...ids(
      "Sultan Rooms or Pure Honey Pride & & 3DB Black Market Marathon",
      "Sultan Rooms or Pure Honey Pride and and 3DB Black Market Marathon",
    )(PLACE_TYPES),
    ...ids("LadyLand Festival", "Ladyland Festival")(PLACE_TYPES),
    ...ids(
      "Bushwick Comedy Club, 259 Melrose St or BCC at Eris Bar",
      "Bushwick Comedy Club 259 Melrose St or BCC at Eris Bar",
    )(PLACE_TYPES),
    // Sights with verbose titles
    ...ids("Jacob Riis Park Queer Beach")(["sight", "attraction", "hike"]),
    ...ids("Coney Island Mermaid Parade")(["sight", "event", "party", "attraction"]),
    // Food entities with "Grab X at" prefix (before extractPlaceName was fixed)
    ...ids("Grab Coffee at Cornwall Coffee Co. & Mercantile")(FOOD_TYPES),
    ...ids("Grab food at Downstate Newburgh")(FOOD_TYPES),
  ];

  // Entities saved with wrong types by the old (less accurate) categorizer.
  const toFix: { id: string; type: EntityType }[] = [
    { id: slugId("party", "Pre-FIST Dedicated Nap Window"), type: "admin" },
    { id: slugId("admin", "Pre-FIST Dedicated Nap Window"), type: "admin" },
    { id: slugId("sight", "Hersheypark Morning Coaster Block"), type: "attraction" },
    { id: slugId("sight", "Rental Car Pickup & Storm King Drive"), type: "travel" },
    { id: slugId("food", "Casual Lunch en Route South"), type: "travel" },
    { id: slugId("travel", "Casual Lunch en Route South"), type: "travel" },
    // Ladyland is a standalone festival, not a club party → event.
    { id: slugId("party", "Ladyland"), type: "event" },
    { id: slugId("club", "Ladyland"), type: "event" },
    { id: slugId("event", "Mermaid Parade"), type: "sight" },
    // Marches/parades mis-typed as club/party by the auto-saver → event.
    { id: slugId("party", "NYC Drag March"), type: "event" },
    { id: slugId("club", "NYC Drag March"), type: "event" },
    { id: slugId("party", "NYC Pride March & PrideFest Finale"), type: "event" },
    { id: slugId("club", "NYC Pride March & PrideFest Finale"), type: "event" },
    { id: slugId("party", "NYC Pride March and PrideFest Finale"), type: "event" },
    { id: slugId("club", "NYC Pride March and PrideFest Finale"), type: "event" },
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
