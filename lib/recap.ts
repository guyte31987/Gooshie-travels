// The public Trip Recap model — a curated, published *snapshot* of a finished
// trip. Nothing here is live: the admin/editor builds a draft in the Recap
// Builder, then Publish writes the final snapshot (with picked photos copied to
// the public Storage prefix). The public /r/[slug] page reads only this snapshot
// via the Admin SDK, so the private Database/comments/photos are never exposed.

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
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
  rating?: number; // 0–10; prefilled from avgRating, editable
  blurb?: string; // the recommendation text
  photos: string[]; // public URLs (after publish copies them)
  comments?: RecapComment[]; // hand-picked
  website?: string;
  instagram?: string;
  address?: string;
};

export type Recap = {
  slug: string;
  tripId: string;
  title: string;
  subtitle?: string;
  dateLabel?: string;
  intro?: string;
  coverPhotoUrl?: string;
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

/** Save a draft (published stays whatever is passed; the builder keeps it false). */
export async function saveRecapDraft(draft: RecapDraft): Promise<void> {
  if (!db) throw new Error("Firestore is not configured.");
  await setDoc(
    doc(db, "recaps", draft.slug),
    { ...draft, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
