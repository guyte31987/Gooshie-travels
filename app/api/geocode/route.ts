// POST /api/geocode — turns a free-text address into precise street-level
// coordinates via OpenStreetMap's Nominatim service. Runs server-side so we can
// send a proper User-Agent (Nominatim's usage policy requires one) and avoid
// browser CORS. Returns { lat, lng } on a confident hit, or {} when nothing
// matches — the caller keeps whatever coords it already had.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function POST(request: Request) {
  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address = (body.address ?? "").trim();
  if (!address) return NextResponse.json({ error: "An address is required." }, { status: 400 });

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // Nominatim requires an identifying User-Agent; a contact is good practice.
        "User-Agent": "GooshieTravels/1.0 (trip planner; contact: admin@gooshie.travel)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Geocoding service unreachable." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Geocoding failed (${res.status}).` }, { status: 502 });
  }

  let data: Array<{ lat?: string; lon?: string }>;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Bad response from geocoder." }, { status: 502 });
  }

  const hit = Array.isArray(data) ? data[0] : undefined;
  const lat = hit ? Number(hit.lat) : NaN;
  const lng = hit ? Number(hit.lon) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return NextResponse.json({ lat, lng });
  }
  // No confident match — return empty so the caller leaves coords untouched.
  return NextResponse.json({});
}
