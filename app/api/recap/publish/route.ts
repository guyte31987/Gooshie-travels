// POST /api/recap/publish — publish / unpublish / delete a Trip Recap.
//
// The curated `recaps/{slug}` doc always stores the *original* (private) photo
// URLs in `photos`/`coverPhotoUrl`. Publishing copies each picked photo from the
// private `photos/...` Storage prefix into the public `public/recaps/{slug}/...`
// prefix and records the public copies in `publicPhotos`/`coverPublicUrl` — which
// is what the public page renders. This keeps the draft editable + re-publishable.
//
//   action "publish"   → copy photos, set published: true
//   action "unpublish" → set published: false, purge public photos, clear public URLs
//   action "delete"    → purge public photos, delete the recap doc
//
// (Legacy: a `publish` boolean is still honoured — true→publish, false→unpublish.)
// All Firestore/Storage work uses the Admin SDK, so it bypasses client security
// rules — the service account (FIREBASE_SERVICE_ACCOUNT) must be configured or
// this returns 503.

import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getApp } from "firebase-admin/app";
import { adminBucket, adminDb, adminReady } from "@/lib/firebase-admin";
import type { Recap, RecapItem } from "@/lib/recap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(
  [process.env.NEXT_PUBLIC_ADMIN_EMAIL, "maissis1987@gmail.com"]
    .filter(Boolean)
    .map((e) => e!.toLowerCase())
);

/** Extract the Storage object path from a Firebase download URL, or null if not one. */
function objectPath(url: string): string | null {
  const m = url.match(/\/o\/(.+?)\?/);
  return m ? decodeURIComponent(m[1]) : null;
}

function publicUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

async function isEditor(email: string): Promise<boolean> {
  if (ADMIN_EMAILS.has(email)) return true;
  const snap = await adminDb().collection("members").doc(email).get();
  if (!snap.exists) return false;
  const d = snap.data() as { role?: string; status?: string };
  return d.status === "approved" && (d.role === "editor" || d.role === "admin");
}

export async function POST(request: Request) {
  if (!adminReady) {
    return NextResponse.json(
      { error: "Recap publishing is not configured. Set FIREBASE_SERVICE_ACCOUNT." },
      { status: 503 }
    );
  }

  // --- auth ---
  const authz = request.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth token." }, { status: 401 });

  let email: string;
  try {
    const decoded = await getAuth(getApp()).verifyIdToken(token);
    email = (decoded.email ?? "").toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
  }
  if (!email || !(await isEditor(email))) {
    return NextResponse.json({ error: "Editors only." }, { status: 403 });
  }

  // --- body ---
  let body: { slug?: string; publish?: boolean; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim();
  if (!slug) return NextResponse.json({ error: "A slug is required." }, { status: 400 });
  const action = body.action ?? (body.publish === false ? "unpublish" : "publish");
  if (!["publish", "unpublish", "delete"].includes(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const ref = adminDb().collection("recaps").doc(slug);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Recap not found." }, { status: 404 });
  const recap = snap.data() as Recap;

  const bucket = adminBucket();

  // Remove every copied public photo for this recap.
  async function purgePublic() {
    try {
      await bucket.deleteFiles({ prefix: `public/recaps/${slug}/` });
    } catch {
      // Folder may not exist yet — ignore.
    }
  }

  // --- delete: purge photos, drop the doc ---
  if (action === "delete") {
    await purgePublic();
    await ref.delete();
    return NextResponse.json({ ok: true, deleted: true, slug });
  }

  // --- unpublish: offline + purge public photos + clear public URLs ---
  if (action === "unpublish") {
    await purgePublic();
    const items = (recap.items ?? []).map((it) => ({ ...it, publicPhotos: [] }));
    await ref.update({ published: false, items, coverPublicUrl: "" });
    return NextResponse.json({ ok: true, published: false });
  }

  // --- publish: copy picked photos to the public prefix; record public copies ---
  const bucketName = bucket.name;
  const cache = new Map<string, string>(); // source URL → public URL (copy once)

  async function toPublic(url: string): Promise<string> {
    if (!url) return "";
    if (cache.has(url)) return cache.get(url)!;
    const src = objectPath(url);
    // Already public, or not a Firebase URL we can copy — leave as-is.
    if (!src) {
      cache.set(url, url);
      return url;
    }
    if (src.startsWith("public/")) {
      cache.set(url, url);
      return url;
    }
    const dest = `public/recaps/${slug}/${src.split("/").pop()}`;
    try {
      await bucket.file(src).copy(bucket.file(dest));
      const out = publicUrl(bucketName, dest);
      cache.set(url, out);
      return out;
    } catch {
      // Source missing — drop it rather than break the page.
      cache.set(url, "");
      return "";
    }
  }

  const items: RecapItem[] = [];
  for (const it of recap.items ?? []) {
    const publicPhotos = (await Promise.all((it.photos ?? []).map(toPublic))).filter(Boolean);
    items.push({ ...it, publicPhotos });
  }
  const coverPublicUrl = recap.coverPhotoUrl ? await toPublic(recap.coverPhotoUrl) : "";

  await ref.update({
    items,
    coverPublicUrl,
    published: true,
    publishedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, published: true, slug });
}
