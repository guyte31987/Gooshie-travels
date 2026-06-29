"use client";

import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { TRIPS } from "@/lib/trips";

export function TripsHome() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <AppHeader title="Gooshie Travels" subtitle="Trips, shared with friends." />

      <ul className="mt-4 space-y-3">
        {TRIPS.map((t) => (
          <li key={t.id}>
            <Link
              href={`/trip/${t.id}`}
              className="block rounded-2xl border border-border-card bg-sheet p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{t.name}</h2>
                <span className="text-slate-300">→</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{t.dateLabel}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.areas.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-xs text-slate-400">
        More trips, in-app trip creation, and the editable Database are coming next.
      </p>
    </div>
  );
}
