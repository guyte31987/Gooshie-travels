// The public Trip Recap model — a curated, published *snapshot* of a finished
// trip. Nothing here is live: the admin/editor builds a draft in the Recap
// Builder, then Publish writes the final snapshot (with picked photos copied to
// the public Storage prefix). The public /r/[slug] page reads only this snapshot
// via the Admin SDK, so the private Database/comments/photos are never exposed.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { EntityType } from "./entities";

/** A picked comment, flattened to just what's safe to show publicly. */
export type RecapComment = { author: string; text: string };

/** One place in the recap — type is kept so the public list can sort/filter by category. */
export type RecapItem = {
  entityId: string;
  name: string;
  type: EntityType;
  generalArea?: string;
  area?: string;
  /** Coordinates for the recap map (street-level when known). */
  lat?: number;
  lng?: number;
  rating?: number; // 0–10; prefilled from avgRating, editable
  /** Featured as a golden "Must visit" highlight on the public page. */
  mustVisit?: boolean;
  blurb?: string; // the recommendation text
  photos: string[]; // the picked photos — original (private) URLs, the source of truth
  /** Public copies of `photos`, written by publish; what the public page renders. */
  publicPhotos?: string[];
  comments?: RecapComment[]; // hand-picked
  website?: string;
  instagram?: string;
  address?: string;
  hours?: string;
};

export type Recap = {
  slug: string;
  tripId: string;
  title: string;
  subtitle?: string;
  dateLabel?: string;
  intro?: string;
  coverPhotoUrl?: string; // the picked cover — original (private) URL
  /** Public copy of the cover, written by publish; used for OG tags + hero. */
  coverPublicUrl?: string;
  items: RecapItem[];
  published: boolean;
  updatedAt?: unknown;
  publishedAt?: unknown;
};

/** A draft recap shares the same shape; `published` is just false until Publish. */
export type RecapDraft = Omit<Recap, "updatedAt" | "publishedAt">;

// --- client helpers (admin/editor builder) ---------------------------------

export function subscribeRecap(slug: string, cb: (r: Recap | null) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(doc(db, "recaps", slug), (snap) =>
    cb(snap.exists() ? (snap.data() as Recap) : null)
  );
}

export async function getRecap(slug: string): Promise<Recap | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "recaps", slug));
  return snap.exists() ? (snap.data() as Recap) : null;
}

/** Find the (single) recap belonging to a trip, if one has been started. */
export async function getRecapByTrip(tripId: string): Promise<Recap | null> {
  if (!db) return null;
  const snap = await getDocs(query(collection(db, "recaps"), where("tripId", "==", tripId)));
  // (db is narrowed here)
  return snap.empty ? null : (snap.docs[0].data() as Recap);
}

/** A short, unguessable slug for a new recap, e.g. "nyc-pride-2026-x7k2". */
export function newRecapSlug(tripId: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${tripId}-${suffix}`;
}

/** Save a draft (published stays whatever is passed; the builder keeps it false). */
export async function saveRecapDraft(draft: RecapDraft): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  await setDoc(
    doc(db, "recaps", draft.slug),
    { ...draft, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * One-shot fetch of every comment the admin could pick for a place: the
 * entity-level comments plus any per-visit comments on the given instance ids.
 * Flattened to {author, text} — the form the snapshot stores.
 */
export async function fetchPickableComments(
  entityId: string,
  instanceIds: string[]
): Promise<RecapComment[]> {
  if (!db) return [];
  const fdb = db;
  const out: RecapComment[] = [];
  const seen = new Set<string>();
  const push = (author: string, text: string) => {
    const key = `${author}::${text}`;
    if (text && !seen.has(key)) {
      seen.add(key);
      out.push({ author, text });
    }
  };

  const snaps = await Promise.all([
    getDocs(query(collection(fdb, "comments"), where("entityId", "==", entityId))),
    ...instanceIds.map((id) =>
      getDocs(query(collection(fdb, "comments"), where("instanceId", "==", id)))
    ),
  ]);
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const c = d.data() as { authorName?: string; text?: string };
      push(c.authorName ?? "Anon", (c.text ?? "").trim());
    }
  }
  return out;
}
