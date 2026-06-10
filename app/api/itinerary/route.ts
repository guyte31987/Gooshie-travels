import { NextResponse } from "next/server";
import { parseIcs, buildSchedule, parseCalendarTimezone } from "@/lib/ics";

// Re-fetch the calendar at most once an hour; Vercel Cron also nudges this.
export const revalidate = 3600;

export async function GET(request: Request) {
  const url = process.env.TRIP_ICAL_URL;
  if (!url) {
    return NextResponse.json(
      { configured: false, days: [], message: "TRIP_ICAL_URL is not set." },
      { status: 200 }
    );
  }

  // ?fresh=1 (admin "Re-sync now") bypasses the cache for an immediate pull.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  try {
    const res = await fetch(url, fresh ? { cache: "no-store" } : { next: { revalidate } });
    if (!res.ok) {
      return NextResponse.json(
        { configured: true, days: [], message: `Calendar fetch failed (${res.status}).` },
        { status: 200 }
      );
    }
    const ics = await res.text();
    const tz = parseCalendarTimezone(ics);
    const events = parseIcs(ics);
    const days = buildSchedule(events, tz);
    return NextResponse.json({
      configured: true,
      tz,
      days,
      count: events.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        days: [],
        message: e instanceof Error ? e.message : "Could not load the calendar.",
      },
      { status: 200 }
    );
  }
}
