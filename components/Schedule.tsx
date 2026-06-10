"use client";

import { useMemo, useState } from "react";
import { useTripData } from "./TripData";
import { EntityDetail } from "./EntityDetail";
import { dayHeading } from "@/lib/ics";
import { indexByEventUid, ENTITY_TABS, type Entity } from "@/lib/entities";

type TripEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startMs?: number;
  endMs?: number;
  isAllDay: boolean;
};

function timeRange(e: TripEvent, tz: string): string {
  if (e.isAllDay || typeof e.startMs !== "number") return "All day";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const start = f.format(new Date(e.startMs));
  if (typeof e.endMs === "number") return `${start} – ${f.format(new Date(e.endMs))}`;
  return start;
}

export function Schedule() {
  const { days, tz, loading, entities, tripId, tripName } = useTripData();
  const [detail, setDetail] = useState<Entity | null>(null);
  const index = useMemo(() => indexByEventUid(entities), [entities]);
  const emojiOf = (e: Entity) => ENTITY_TABS.find((t) => t.type === e.type)?.emoji ?? "";

  if (loading) return <Notice tone="muted">Loading itinerary…</Notice>;
  if (days.length === 0)
    return <Notice tone="muted">No events found in the calendar yet.</Notice>;

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.dayKey} className="scroll-mt-20">
          <div className="sticky top-0 z-10 -mx-4 bg-slate-50/90 px-4 py-2 backdrop-blur">
            <h2 className="text-lg font-semibold">{dayHeading(day.dayKey)}</h2>
          </div>

          {day.basedIn.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {day.basedIn.map((b) => (
                <span
                  key={b.uid}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  title={b.location}
                >
                  🛏 Based in: {b.summary}
                </span>
              ))}
            </div>
          )}

          <ol className="mt-3 space-y-2">
            {day.events.length === 0 && (
              <li className="text-sm text-slate-400">No scheduled events.</li>
            )}
            {day.events.map((e) => {
              const linked = index.get(e.uid)?.entity;
              return (
                <li
                  key={e.uid}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {linked ? (
                      <button
                        onClick={() => setDetail(linked)}
                        className="group flex items-center gap-1.5 text-left"
                      >
                        <span>{emojiOf(linked)}</span>
                        <h3 className="font-medium leading-snug text-indigo-700 underline-offset-2 group-hover:underline">
                          {e.summary}
                        </h3>
                      </button>
                    ) : (
                      <h3 className="font-medium leading-snug">{e.summary}</h3>
                    )}
                    <span className="shrink-0 text-xs font-medium text-slate-500">
                      {timeRange(e, tz)}
                    </span>
                  </div>
                  {e.location && <p className="mt-1 text-sm text-slate-500">📍 {e.location}</p>}
                  {e.description && (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Planning note
                      </div>
                      <p className="whitespace-pre-line text-sm text-slate-600">{e.description}</p>
                    </div>
                  )}
                  {linked && (
                    <button
                      onClick={() => setDetail(linked)}
                      className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Open {linked.name} · comments &amp; photos →
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {detail && (
        <EntityDetail
          entity={detail}
          tripId={tripId}
          tripName={tripName}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "error" | "muted" }) {
  const cls =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-white text-slate-500";
  return <div className={`rounded-xl border p-4 text-sm ${cls}`}>{children}</div>;
}
