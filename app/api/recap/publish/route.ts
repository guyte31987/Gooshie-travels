// POST /api/recap/publish — publishes (or unpublishes) a Trip Recap.
//
// On publish it: verifies the caller is an editor/admin, reads the curated
// `recaps/{slug}` draft, copies every picked photo (item photos + cover) from the
// private `photos/...` Storage prefix into the public `public/recaps/{slug}/...`
// prefix, rewrites the URLs to the public ones, and flips `published: true`.
// On unpublish it just flips `published: false`. All Firestore/Storage work uses
// the Admin SDK, so it bypasses client security rules — the service account
// (FIREBASE_SERVICE_ACCOUNT) must be configured or this returns 503.

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
  let body: { slug?: string; publish?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim();
  const publish = body.publish !== false;
  if (!slug) return NextResponse.json({ error: "A slug is required." }, { status: 400 });

  const ref = adminDb().collection("recaps").doc(slug);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Recap not found." }, { status: 404 });
  const recap = snap.data() as Recap;

  // --- unpublish: just flip the flag ---
  if (!publish) {
    await ref.update({ published: false });
    return NextResponse.json({ ok: true, published: false });
  }

  // --- publish: copy picked photos to the public prefix, rewrite URLs ---
  const bucket = adminBucket();
  const bucketName = bucket.name;
  const cache = new Map<string, string>(); // source URL → public URL (copy once)

  async function toPublic(url: string): Promise<string> {
    if (!url) return url;
    if (cache.has(url)) return cache.get(url)!;
    const src = objectPath(url);
    // Already public, or not a Firebase URL we can copy — leave as-is.
    if (!src || src.startsWith("public/")) {
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
    const photos = (await Promise.all((it.photos ?? []).map(toPublic))).filter(Boolean);
    items.push({ ...it, photos });
  }
  const coverPhotoUrl = recap.coverPhotoUrl ? await toPublic(recap.coverPhotoUrl) : undefined;

  await ref.update({
    items,
    ...(coverPhotoUrl ? { coverPhotoUrl } : {}),
    published: true,
    publishedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, published: true, slug });
}
