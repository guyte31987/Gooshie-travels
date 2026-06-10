"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./AppHeader";
import { buildEntities, ENTITY_TABS, type Entity, type ItinDay } from "@/lib/entities";

/**
 * The Database — the master catalog of every entity across all trips. Read-only
 * for now; Stage B makes each entity editable and Firestore-backed. Entities are
 * currently derived from the seed data + calendar (the same engine the trips use).
 */
export function DatabaseView() {
  const [days, setDays] = useState<ItinDay[]>([]);
  const [tz, setTz] = useState("Europe/London");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    fetch("/api/itinerary")
      .then((r) => r.json())
      .then((d: { days?: ItinDay[]; tz?: string }) => {
        setDays(d.days ?? []);
        setTz(d.tz ?? "Europe/London");
      })
      .finally(() => setLoaded(true));
  }, []);

  const entities = useMemo(() => buildEntities(days, tz), [days, tz]);
  const regions = useMemo(
    () => Array.from(new Set(entities.map((e) => e.generalArea).filter(Boolean))).sort() as string[],
    [entities]
  );

  const filtered = entities.filter((e) => {
    if (region && e.generalArea !== region) return false;
    if (q && !`${e.name} ${e.area ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  const typeLabel = (t: string) => ENTITY_TABS.find((x) => x.type === t);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <AppHeader title="Database" subtitle="Master catalog of all entities" backHref="/" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the whole database…"
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium shadow-sm"
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {!loaded ? (
        <Note>Loading the database…</Note>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            {filtered.length} of {entities.length} entities
          </p>
          <ul className="space-y-2">
            {filtered.map((e) => (
              <DbRow key={e.id} e={e} type={typeLabel(e.type)} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Read-only for now. Next: edit any field here (hours, location, region), and these become the
        single source the trips draw from.
      </p>
    </div>
  );
}

function DbRow({ e, type }: { e: Entity; type?: { emoji: string; label: string } }) {
  const tripCount = e.slots.length > 0 ? 1 : 0; // one trip today; multi-trip in Stage B
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{type?.emoji}</span>
          <h3 className="font-medium">{e.name}</h3>
          {e.closed && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              CLOSED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {e.generalArea && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{e.generalArea}</span>
          )}
          {tripCount > 0 && <span>{tripCount} trip</span>}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
        {e.area && <span>{e.area}</span>}
        {e.hours && <span>🕑 {e.hours}</span>}
        {e.price && <span>{e.price}</span>}
      </div>
    </li>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{children}</p>
  );
}
