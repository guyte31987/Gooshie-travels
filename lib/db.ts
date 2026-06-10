"use client";

// Firestore data layer for the Database (entities), trips, per-trip curation
// (membership + manual appearances), trip calendar secrets + cached itineraries,
// and the managed list of general areas. Confirmed appearances are NOT stored —
// they're computed live by matching a trip's calendar to the entities. Only
// manual planning (planned / Plan B), curation deltas, and dismissed conflicts
// are persisted here.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { db } from "./firebase";
import type { EntityType } from "./entities";
import { DEFAULT_GENERAL_AREAS } from "./areas";

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
  hours?: string;
  price?: string;
  source?: string;
  booking?: string;
  notes?: string;
  closed?: boolean;
  bestDay?: string;
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

export const subscribeEntities = (cb: (e: DBEntity[]) => void) => subColl<DBEntity>("entities", cb);

export async function saveEntity(e: DBEntity): Promise<void> {
  await setDoc(doc(requireDb(), "entities", e.id), { ...e, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteEntity(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "entities", id));
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
