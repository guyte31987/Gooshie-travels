"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type Role = "viewer" | "editor" | "admin";
export type MemberStatus = "pending" | "approved" | "denied";

export type Member = {
  email: string;
  name: string;
  status: MemberStatus;
  role: Role;
  requestedAt?: Timestamp | null;
  decidedAt?: Timestamp | null;
};

const COL = "members";

/** Read a single membership record (doc id = lowercased email). */
export async function getMember(email: string): Promise<Member | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COL, email.toLowerCase()));
  return snap.exists() ? (snap.data() as Member) : null;
}

/**
 * Self-service request from a signed-in user. Always lands as a pending,
 * viewer-role record — the Firestore rules enforce that a user can only create
 * their own request and can't grant themselves a higher role.
 */
export async function requestAccess(email: string, name: string): Promise<void> {
  if (!db) throw new Error("Database unavailable");
  const lower = email.toLowerCase();
  await setDoc(doc(db, COL, lower), {
    email: lower,
    name: name.trim() || lower,
    status: "pending",
    role: "viewer",
    requestedAt: serverTimestamp(),
  });
}

/** Admin: pre-approve an email before the person has ever signed in. */
export async function inviteMember(email: string, role: Role = "viewer"): Promise<void> {
  if (!db) throw new Error("Database unavailable");
  const lower = email.toLowerCase();
  await setDoc(doc(db, COL, lower), {
    email: lower,
    name: lower,
    status: "approved",
    role,
    decidedAt: serverTimestamp(),
  });
}

export async function approveMember(email: string, role: Role = "viewer"): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COL, email.toLowerCase()), {
    status: "approved",
    role,
    decidedAt: serverTimestamp(),
  });
}

export async function denyMember(email: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COL, email.toLowerCase()), {
    status: "denied",
    decidedAt: serverTimestamp(),
  });
}

export async function setRole(email: string, role: Role): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, COL, email.toLowerCase()), { role });
}

export async function removeMember(email: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COL, email.toLowerCase()));
}

/** Admin live view of all members. Returns an unsubscribe function. */
export function subscribeMembers(cb: (members: Member[]) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(collection(db, COL), (snap) => {
    cb(snap.docs.map((d) => d.data() as Member));
  });
}
