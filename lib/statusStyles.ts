// Two independent status axes for an itinerary instance (redesign brief §9).
// Activity status drives the whole row's weight/colour; booking status is a
// small pill layered on top. Both are typographic — no emoji.

import type { ActivityStatus, BookingStatus } from "./itinerary";

/** Booking axis — a pill. `short` is used in the compact calendar block. */
export const BOOKING_PILL: Record<BookingStatus, { label: string; short: string; className: string }> = {
  done: { label: "✓ Booked", short: "✓", className: "border border-transparent bg-booked-bg text-booked" },
  needed: { label: "Book now!", short: "Book!", className: "border border-transparent bg-rust text-white" },
  walkin: { label: "No booking needed", short: "", className: "border border-border-card bg-transparent text-secondary" },
};

/** Activity axis — sets the row's overall weight/colour. */
export const ACTIVITY_PILL: Record<ActivityStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "border border-border-card bg-white text-body" },
  planned: { label: "Tentative", className: "border border-tentative/40 bg-tentative-bg text-tentative" },
  done: { label: "Done", className: "border border-transparent bg-fill-soft text-secondary" },
  notDone: { label: "Cancelled", className: "border border-[#e2c4bc] bg-transparent text-[#b08379]" },
};
