// Trip catalog. For now this is a static list with one trip; in Stage B it moves
// to a Firestore `trips` collection (same shape) so trips can be created in-app.

export type TripMeta = {
  id: string;
  name: string;
  dateLabel: string;
  /** General areas this trip covers — seeds which entities its Planning includes. */
  areas: string[];
};

export const TRIPS: TripMeta[] = [
  {
    id: "nyc-2026",
    name: "NYC Pride & Berkshires",
    dateLabel: "18–28 June 2026",
    areas: ["New York City", "Upstate New York", "Berkshires (Western MA)", "Pennsylvania"],
  },
];

export function getTrip(id: string): TripMeta | undefined {
  return TRIPS.find((t) => t.id === id);
}
