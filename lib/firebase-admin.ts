// Server-only Firebase Admin SDK. Used by the public Recap pages (SSR reads of
// the curated `recaps/{slug}` snapshot) and the publish API route (copying picked
// photos into the public Storage prefix). NEVER import this from a client
// component — it relies on a service-account key that must stay server-side.
//
// Configure with FIREBASE_SERVICE_ACCOUNT: the JSON from Firebase console →
// Project settings → Service accounts → Generate new private key. It may be the
// raw JSON or base64-encoded JSON (handy for some env-var UIs). When absent,
// adminReady is false and callers should degrade gracefully (e.g. 503 / 404).

import { getApps, getApp, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function parseServiceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const text = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  try {
    const json = JSON.parse(text);
    // Env vars often escape newlines in the private key — restore them.
    if (typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  } catch {
    return null;
  }
}

const serviceAccount = parseServiceAccount();

/** The default bucket name, e.g. "my-project.appspot.com". */
function bucketName(): string | undefined {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (serviceAccount ? `${serviceAccount.project_id}.appspot.com` : undefined)
  );
}

/** True only when a valid service account has been provided. */
export const adminReady = Boolean(serviceAccount);

let cached: App | undefined;

function adminApp(): App {
  if (!serviceAccount) throw new Error("Firebase Admin is not configured (FIREBASE_SERVICE_ACCOUNT).");
  if (cached) return cached;
  cached = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
        storageBucket: bucketName(),
      });
  return cached;
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export function adminBucket() {
  return getStorage(adminApp()).bucket(bucketName());
}
