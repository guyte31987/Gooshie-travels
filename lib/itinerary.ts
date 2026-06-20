"use client";

// The NEW itinerary model: app-owned Slots + Instances (replaces the calendar
// parser). A Slot is a day/time window; an Instance fills it with an Entity at a
// Capacity (confirmed / planned / planB). The grid reads & writes these; the ICS
// exporter renders them out. Stored per-trip in Firestore.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type Capacity = "confirmed" | "planned" | "planB";

/** Where the activity itself stands (separate from booking). */
export type ActivityStatus = "planned" | "scheduled" | "done" | "notDone";
/** Whether a reservation is needed and where it stands. */
export type BookingStatus = "walkin" | "needed" | "done";

/** A time window in the itinerary. start/end are minutes-from-midnight (local). */
export type Slot = {
  id: string;
  tripId: string;
  day: string; // YYYY-MM-DD
  start: number;
  end: number;
  label: string;
};

/** One entity competing for / filling a slot. id = `${slotId}__${entityId}`. */
export type PlanInstance = {
  id: string;
  tripId: string;
  slotId: string;
  entityId: string;
  capacity: Capacity;
  note?: string;
  /** Activity lifecycle — defaults to "scheduled" when absent. */
  status?: ActivityStatus;
  /** Reservation state — when absent, derive from the legacy needsBooking/booked. */
  bookingStatus?: BookingStatus;
  needsBooking?: boolean;
  booked?: boolean;
  bookingNote?: string;
  /** "Book this many days before the trip starts." */
  bookingOffsetDays?: number;
  /** Firebase Storage download URLs for visit photos. */
  photos?: string[];
  /** Per-user ratings for this visit. Key is the user's email. */
  ratings?: Record<string, { score: number; name: string }>;
};

export const instanceId = (slotId: string, entityId: string) => `${slotId}__${entityId}`;

/** Resolve an instance's booking state, falling back to the legacy booleans. */
export function bookingStatusOf(i: { bookingStatus?: BookingStatus; needsBooking?: boolean; booked?: boolean }): BookingStatus {
  if (i.bookingStatus) return i.bookingStatus;
  if (i.booked) return "done";
  if (i.needsBooking) return "needed";
  return "walkin";
}

/** Resolve an instance's activity status (defaults to scheduled). */
export function activityStatusOf(i: { status?: ActivityStatus }): ActivityStatus {
  return i.status ?? "scheduled";
}

const slotsPath = (tripId: string) => `tripSlots/${tripId}/items`;
const instPath = (tripId: string) => `tripPlanInstances/${tripId}/items`;

// --- subscriptions ----------------------------------------------------------

export function subscribeSlots(tripId: string, cb: (s: Slot[]) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(collection(db, slotsPath(tripId)), (snap) => cb(snap.docs.map((d) => d.data() as Slot)));
}

export function subscribePlanInstances(tripId: string, cb: (i: PlanInstance[]) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(collection(db, instPath(tripId)), (snap) => cb(snap.docs.map((d) => d.data() as PlanInstance)));
}

// --- writes -----------------------------------------------------------------

export async function saveSlot(slot: Slot): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, slotsPath(slot.tripId), slot.id), { ...slot, updatedAt: serverTimestamp() }, { merge: true });
}

export async function savePlanInstance(inst: PlanInstance): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, instPath(inst.tripId), inst.id), { ...inst, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deletePlanInstance(tripId: string, id: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, instPath(tripId), id));
}

/** Delete a slot and every instance attached to it. */
export async function deleteSlot(tripId: string, slotId: string, instanceIds: string[]): Promise<void> {
  if (!db) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, slotsPath(tripId), slotId));
  for (const id of instanceIds) batch.delete(doc(db, instPath(tripId), id));
  await batch.commit();
}

// --- ratings ----------------------------------------------------------------

/**
 * Set (or clear) the current user's rating for a plan instance, then update
 * the entity's denormalised avgRating/ratingCount atomically via a transaction.
 * Pass score=null to remove the rating.
 */
export async function setInstanceRating(
  tripId: string,
  instanceDocId: string,
  entityId: string,
  userEmail: string,
  userName: string,
  score: number | null
): Promise<void> {
  if (!db) return;
  const instRef = doc(db, instPath(tripId), instanceDocId);
  const entityRef = doc(db, "entities", entityId);

  await runTransaction(db, async (tx) => {
    const [instSnap, entitySnap] = await Promise.all([tx.get(instRef), tx.get(entityRef)]);

    const instData = instSnap.data() as (PlanInstance & { ratings?: Record<string, { score: number; name: string }> }) | undefined;
    const entityData = entitySnap.data() as { avgRating?: number; ratingCount?: number } | undefined;

    const oldRatings: Record<string, { score: number; name: string }> = instData?.ratings ?? {};
    const oldUserScore = oldRatings[userEmail]?.score ?? null;

    const newRatings = { ...oldRatings };
    if (score === null) {
      delete newRatings[userEmail];
    } else {
      newRatings[userEmail] = { score, name: userName };
    }

    tx.set(instRef, { ratings: newRatings, updatedAt: serverTimestamp() }, { merge: true });

    // Incrementally update the entity's running average.
    const oldCount = entityData?.ratingCount ?? 0;
    const oldTotal = (entityData?.avgRating ?? 0) * oldCount;
    let newTotal = oldTotal;
    let newCount = oldCount;
    if (oldUserScore !== null) { newTotal -= oldUserScore; newCount--; }
    if (score !== null) { newTotal += score; newCount++; }
    const newAvg = newCount > 0 ? Math.round((newTotal / newCount) * 10) / 10 : null;
    tx.set(entityRef, { avgRating: newAvg, ratingCount: newCount, updatedAt: serverTimestamp() }, { merge: true });
  });
}

// --- seed -------------------------------------------------------------------

export async function isItinerarySeeded(tripId: string): Promise<boolean> {
  if (!db) return false;
  const snap = await getDocs(collection(db, slotsPath(tripId)));
  return !snap.empty;
}

/** Write the initial slots + instances for a trip (batched). Caller guards on isItinerarySeeded. */
export async function seedItinerary(slots: Slot[], instances: PlanInstance[]): Promise<{ slots: number; instances: number }> {
  if (!db) return { slots: 0, instances: 0 };
  const database = db;
  const write = async <T extends { id: string }>(path: string, rows: T[]) => {
    for (let i = 0; i < rows.length; i += 400) {
      const batch = writeBatch(database);
      for (const r of rows.slice(i, i + 400)) batch.set(doc(database, path, r.id), { ...r, updatedAt: serverTimestamp() });
      await batch.commit();
    }
  };
  if (!slots.length) return { slots: 0, instances: 0 };
  await write(slotsPath(slots[0].tripId), slots);
  await write(instPath(slots[0].tripId), instances);
  return { slots: slots.length, instances: instances.length };
}
