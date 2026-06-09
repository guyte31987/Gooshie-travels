"use client";

import { doc, getDoc } from "firebase/firestore";
import { db, ADMIN_EMAIL } from "./firebase";

export type AccessState = "admin" | "member" | "pending" | "unknown";

/**
 * Resolves what a signed-in email is allowed to do. The admin is configured via
 * env; everyone else must appear in the `allowlist` collection (doc id = the
 * lowercased email) to skip the pending queue. Invited friends are added there,
 * so they never wait for approval.
 */
export async function resolveAccess(email: string | null | undefined): Promise<AccessState> {
  if (!email) return "unknown";
  const lower = email.toLowerCase();
  if (lower === ADMIN_EMAIL) return "admin";
  if (!db) return "unknown";
  try {
    const snap = await getDoc(doc(db, "allowlist", lower));
    if (snap.exists()) return "member";
  } catch {
    // Firestore not reachable / rules — treat as pending rather than crash.
  }
  return "pending";
}
