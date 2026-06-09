import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// Hit by Vercel Cron (see vercel.json) to keep the cached itinerary fresh
// without anyone needing to load the page first.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }
  revalidatePath("/api/itinerary");
  revalidatePath("/");
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}
