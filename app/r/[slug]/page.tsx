// Public Trip Recap — server-rendered from the curated `recaps/{slug}` snapshot
// via the Admin SDK. No client Firebase, no auth: anyone with the link can view.
// Only a *published* recap renders; drafts and unknown slugs 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDb, adminReady } from "@/lib/firebase-admin";
import type { Recap } from "@/lib/recap";
import { RecapView } from "@/components/RecapView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadRecap(slug: string): Promise<Recap | null> {
  if (!adminReady) return null;
  const snap = await adminDb().collection("recaps").doc(slug).get();
  if (!snap.exists) return null;
  const r = snap.data() as Recap;
  return r.published ? r : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recap = await loadRecap(slug);
  if (!recap) return { title: "Recap not found" };
  const description = recap.intro || recap.subtitle || `A trip recap with ${recap.items.length} recommendations.`;
  const cover = recap.coverPublicUrl || recap.coverPhotoUrl;
  return {
    title: recap.title,
    description,
    openGraph: {
      title: recap.title,
      description,
      type: "article",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: recap.title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function RecapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recap = await loadRecap(slug);
  if (!recap) notFound();
  return <RecapView recap={recap} />;
}
