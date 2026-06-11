"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./AppHeader";
import { EntityDetail } from "./EntityDetail";
import { EntityForm } from "./EntityForm";
import { ImportDialog } from "./ImportDialog";
import { useAuth } from "./AuthProvider";
import {
  ENTITY_TABS,
  OPERATIONAL_TYPES,
  PARKED_TYPES,
  buildEntities,
  buildSeed,
  buildCuratedSeedEntities,
  type EntityType,
  type ItinDay,
} from "@/lib/entities";
import {
  subscribeEntities,
  deleteEntity,
  saveEntity,
  seedDatabase,
  seedEntitiesIfNew,
  getAreas,
  type DBEntity,
} from "@/lib/db";
import { exportEntities } from "@/lib/export";
import { TRIPS } from "@/lib/trips";

export function DatabaseView() {
  const { isAdmin } = useAuth();
  const [entities, setEntities] = useState<DBEntity[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [type, setType] = useState("");
  const [viewing, setViewing] = useState<DBEntity | null>(null);
  const [editing, setEditing] = useState<DBEntity | null | "new">(null);
  const [importing, setImporting] = useState(false);
  const [showOperational, setShowOperational] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeEntities((e) => {
      setEntities(e);
      setLoaded(true);
    });
    getAreas().then(setAreas).catch(() => {});
    return unsub;
  }, []);

  const regions = useMemo(
    () => Array.from(new Set(entities.map((e) => e.generalArea).filter(Boolean))).sort() as string[],
    [entities]
  );

  const filtered = entities
    .filter((e) => showOperational || !OPERATIONAL_TYPES.has(e.type))
    .filter((e) => !region || e.generalArea === region)
    .filter((e) => !type || e.type === type)
    .filter(
      (e) => !q || `${e.name} ${e.area ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const typeCount = (t: string) => entities.filter((e) => e.type === t).length;

  const typeOf = (t: string) => ENTITY_TABS.find((x) => x.type === t);

  const seed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary", { cache: "no-store" });
      const data = await res.json();
      const days: ItinDay[] = data.days ?? [];
      const tz: string = data.tz ?? "Europe/London";
      const built = buildEntities(days, tz);
      const { entities: dbEntities, items } = buildSeed(built);
      const trip = TRIPS[0];
      await seedDatabase({
        trip: { id: trip.id, name: trip.name, dateLabel: trip.dateLabel, areas: trip.areas },
        entities: dbEntities,
        items,
        itinerary: { tz, days, syncedAt: new Date().toISOString() },
      });
    } catch (e) {
      console.error("Seed failed:", e);
      setError(e instanceof Error ? e.message : "Seed failed — see console.");
    } finally {
      setSeeding(false);
    }
  };

  const backfillCurated = async () => {
    setBackfilling(true);
    setNotice(null);
    setError(null);
    try {
      const created = await seedEntitiesIfNew(buildCuratedSeedEntities());
      setNotice(
        created > 0
          ? `Added ${created} curated ${created === 1 ? "place" : "places"}. Export → enrich → import to fill addresses & coordinates.`
          : "All curated places are already in the database."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Back-fill failed — see console.");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <AppHeader title="Database" subtitle="Master catalog of all entities" backHref="/" />

      {loaded && entities.length === 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <p className="font-medium text-indigo-900">The Database is empty.</p>
          <p className="mt-1 text-indigo-700">
            Seed it once from your current spreadsheets + calendar. This writes every entity and the
            NYC trip into the database so you can edit them.
          </p>
          {isAdmin ? (
            <button
              onClick={seed}
              disabled={seeding}
              className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
            >
              {seeding ? "Seeding…" : "Seed database"}
            </button>
          ) : (
            <p className="mt-3 text-xs text-indigo-500">Ask an admin to seed it.</p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-rose-100 p-2 text-xs text-rose-700">{error}</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the whole database…"
              className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
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
            <button
              onClick={() => setEditing("new")}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
            >
              + Add
            </button>
            {isAdmin && (
              <button
                onClick={backfillCurated}
                disabled={backfilling}
                title="Add the curated clubs, museums, sights, hikes, spas & attractions (only creates ones not already present)"
                className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                {backfilling ? "Adding…" : "Add curated places"}
              </button>
            )}
          </div>

          {notice && (
            <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{notice}</p>
          )}
          {error && (
            <p className="mb-3 rounded-lg bg-rose-100 p-2 text-xs text-rose-700">{error}</p>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            <TypeChip active={!type} onClick={() => setType("")}>
              All <span className="text-slate-400">{filtered.length}</span>
            </TypeChip>
            {ENTITY_TABS
              .filter((t) => (showOperational || !t.operational) && typeCount(t.type) > 0)
              .map((t) => (
                <TypeChip key={t.type} active={type === t.type} onClick={() => setType(t.type)}>
                  {t.emoji} {t.label} <span className="text-slate-400">{typeCount(t.type)}</span>
                </TypeChip>
              ))}
            <button
              onClick={() => { setShowOperational((v) => !v); if (type && OPERATIONAL_TYPES.has(type as never)) setType(""); }}
              className="rounded-full px-2.5 py-1 font-medium text-slate-400 bg-slate-50 hover:bg-slate-100"
            >
              {showOperational ? "Hide" : "Show"} admin/travel
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
            <span>Export {filtered.length}:</span>
            {(["csv", "excel", "word"] as const).map((f) => (
              <button
                key={f}
                onClick={() =>
                  exportEntities(
                    filtered.map((e) => ({ ...e, slots: [] })),
                    f,
                    "database"
                  )
                }
                className="rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-50"
              >
                {f === "csv" ? "CSV" : f === "excel" ? "Excel" : "Word"}
              </button>
            ))}
            <span className="ml-2 border-l border-slate-200 pl-3">Enrich:</span>
            <button
              onClick={() => setImporting(true)}
              className="rounded border border-indigo-300 px-2 py-0.5 font-medium text-indigo-600 hover:bg-indigo-50"
            >
              Import CSV
            </button>
          </div>

          <p className="mb-2 text-xs text-slate-400">
            {filtered.length} of {entities.length} entities
          </p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {filtered.map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-4 py-3">
                <button
                  onClick={() => setViewing(e)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{typeOf(e.type)?.emoji}</span>
                    <span className="font-medium text-sm">{e.name}</span>
                    {e.closed && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        CLOSED
                      </span>
                    )}
                    {e.calendarSource && (
                      <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                        from calendar
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                    {e.generalArea && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        {e.generalArea}
                      </span>
                    )}
                    {e.area && <span>{e.area}</span>}
                    {e.hours && <span>🕑 {e.hours}</span>}
                  </div>
                </button>
                <div className="flex shrink-0 gap-1 mt-0.5">
                  {isAdmin && !PARKED_TYPES.has(e.type) && (
                    <ParkSelect onPark={(t) => saveEntity({ ...e, type: t })} />
                  )}
                  <button
                    onClick={() => setEditing(e)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${e.name} from the database?`)) deleteEntity(e.id);
                    }}
                    className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Del
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {viewing && (
        <EntityDetail
          entity={{ ...viewing, slots: [] }}
          onClose={() => setViewing(null)}
        />
      )}

      {editing !== null && (
        <EntityForm
          entity={editing === "new" ? null : editing}
          areas={areas.length ? areas : regions}
          onClose={() => setEditing(null)}
        />
      )}

      {importing && <ImportDialog entities={entities} onClose={() => setImporting(false)} />}
    </div>
  );
}

/**
 * Compact "park this somewhere harmless" control. Files a noisy logistics entity
 * into a bucket type (Travel / Admin / Misc) so the calendar sync stops flagging
 * it — without deleting it from the DB or touching the calendar.
 */
function ParkSelect({ onPark }: { onPark: (t: EntityType) => void }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPark(e.target.value as EntityType);
      }}
      title="Park this as a logistics/misc bucket so the calendar sync stops flagging it"
      className="rounded border border-slate-300 px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
    >
      <option value="">Park…</option>
      <option value="travel">✈️ Travel</option>
      <option value="admin">📋 Admin</option>
      <option value="uncategorised">❓ Misc</option>
    </select>
  );
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-medium transition ${
        active ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
