// Trip catalog. For now this is a static list with one trip; in Stage B it moves
// to a Firestore `trips` collection (same shape) so trips can be created in-app.

export type TripMeta = {
  id: string;
  name: string;
  dateLabel: string;
  /** Trip span (YYYY-MM-DD) — drives the itinerary grid's day columns. */
  startDate: string;
  endDate: string;
  /** General areas this trip covers — seeds which entities its Planning includes. */
  areas: string[];
};

export const TRIPS: TripMeta[] = [
  {
    id: "nyc-2026",
    name: "NYC Pride & Berkshires",
    dateLabel: "18–28 June 2026",
    startDate: "2026-06-18",
    endDate: "2026-06-28",
    areas: ["New York City", "Upstate New York", "Berkshires (Western MA)", "Pennsylvania"],
  },
];

/** Inclusive list of YYYY-MM-DD days a trip spans. */
export function tripDays(t: TripMeta): string[] {
  const out: string[] = [];
  const [y, m, d] = t.startDate.split("-").map(Number);
  const end = t.endDate;
  for (let dt = new Date(Date.UTC(y, m - 1, d)); ; dt.setUTCDate(dt.getUTCDate() + 1)) {
    const iso = dt.toISOString().slice(0, 10);
    out.push(iso);
    if (iso >= end) break;
  }
  return out;
}

export function getTrip(id: string): TripMeta | undefined {
  return TRIPS.find((t) => t.id === id);
}
