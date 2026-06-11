import { ItineraryGrid } from "@/components/ItineraryGrid";

// Standalone design prototype for the new itinerary grid. Uses throwaway sample
// data (lib/preview-data.ts) — no auth, no Firestore, no effect on real trips.
// Visit /preview to play with drag-to-move, edge-resize, and Plan B swapping.

export const metadata = { title: "Itinerary grid — preview" };

export default function PreviewPage() {
  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Itinerary grid — prototype</h1>
        <p className="mt-1 text-sm text-slate-500">
          NYC Trip · 18–28 June 2026 · sample data only. Drag blocks to move, drag the bottom edge
          to resize, tap to open and swap Plan B options.
        </p>
      </header>
      <ItineraryGrid />
    </main>
  );
}
