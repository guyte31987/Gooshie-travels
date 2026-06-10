"use client";

import { ADMIN_EMAIL } from "./firebase";
import { getMember, type Role } from "./members";

export type AccessState =
  | "admin" // the configured admin email
  | "approved" // approved member
  | "pending" // requested, awaiting decision
  | "denied" // explicitly rejected
  | "unregistered" // signed in but never requested access
  | "unknown"; // not signed in / db unavailable

export type Access = { state: AccessState; role: Role | null };

/**
 * Resolves what a signed-in email is allowed to do. The admin is configured via
 * env and always wins. Everyone else is looked up in the `members` collection:
 * approved members get their stored role, pending/denied get those states, and
 * a signed-in stranger with no record is "unregistered" (shown the request
 * screen).
 */
export async function resolveAccess(email: string | null | undefined): Promise<Access> {
  if (!email) return { state: "unknown", role: null };
  const lower = email.toLowerCase();
  if (lower === ADMIN_EMAIL) return { state: "admin", role: "admin" };

  try {
    const member = await getMember(lower);
    if (!member) return { state: "unregistered", role: null };
    if (member.status === "approved") return { state: "approved", role: member.role };
    if (member.status === "denied") return { state: "denied", role: null };
    return { state: "pending", role: null };
  } catch {
    // Rules/network error — treat as unregistered rather than crash.
    return { state: "unregistered", role: null };
  }
}
