"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { EntityDetail } from "./EntityDetail";
import { EntityForm } from "./EntityForm";
import { ImportDialog } from "./ImportDialog";
import { useAuth } from "./AuthProvider";
import {
  ENTITY_TABS,
  OPERATIONAL_TYPES,
  PARKED_TYPES,
  buildCuratedSeedEntities,
  type EntityType,
} from "@/lib/entities";
import { buildAllSeedEntities } from "@/lib/seed-entities";
import { nycSeedEntities } from "@/lib/itinerary-seed";
import {
  subscribeEntities,
  deleteEntity,
  saveEntity,
  bulkUpdateEntities,
  bulkDeleteEntities,
  seedDatabase,
  seedEntitiesIfNew,
  getAreas,
  type DBEntity,
} from "@/lib/db";
import { subscribePlanInstances } from "@/lib/itinerary";
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const searchParams = useSearchParams();
  const [usedEntityIds, setUsedEntityIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = subscribeEntities((e) => {
      setEntities(e);
      setLoaded(true);
    });
    getAreas().then(setAreas).catch(() => {});
    return unsub;
  }, []);

  // Track which entity IDs are referenced by any trip's itinerary, so duplicate
  // DB entries can be told apart (the referenced one is the live/correct one).
  useEffect(() => {
    const byTrip = new Map<string, Set<string>>();
    const unsubs = TRIPS.map((t) =>
      subscribePlanInstances(t.id, (insts) => {
        byTrip.set(t.id, new Set(insts.map((i) => i.entityId)));
        setUsedEntityIds(new Set([...byTrip.values()].flatMap((s) => [...s])));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // Auto-open an entity card when ?open=<id> is in the URL (e.g. from itinerary).
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || !entities.length) return;
    const match = entities.find((e) => e.id === openId);
    if (match) setViewing(match);
  }, [searchParams, entities]);

  const regions = useMemo(
    () => Array.from(new Set(entities.map((e) => e.generalArea).filter(Boolean))).sort() as string[],
    [entities]
  );

  // Entities whose normalized name collides with another entity → likely a
  // duplicate from the two seeding passes (slugId vs preview id).
  const dupKeys = useMemo(() => {
    const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const counts = new Map<string, number>();
    for (const e of entities) counts.set(norm(e.name), (counts.get(norm(e.name)) ?? 0) + 1);
    return new Set([...counts].filter(([, c]) => c > 1).map(([k]) => k));
  }, [entities]);
  const isDup = (name: string) => dupKeys.has(name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const dupCount = useMemo(() => entities.filter((e) => isDup(e.name)).length, [entities, dupKeys]);
  const [dupOnly, setDupOnly] = useState(false);

  const [calSourceOnly, setCalSourceOnly] = useState(false);
  const calSourceCount = entities.filter((e) => e.calendarSource).length;

  const filtered = entities
    .filter((e) => showOperational || !OPERATIONAL_TYPES.has(e.type))
    .filter((e) => !region || e.generalArea === region)
    .filter((e) => !type || e.type === type)
    .filter((e) => !calSourceOnly || e.calendarSource)
    .filter((e) => !dupOnly || isDup(e.name))
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
      const trip = TRIPS[0];
      await seedDatabase({
        trip: { id: trip.id, name: trip.name, dateLabel: trip.dateLabel, areas: trip.areas },
        entities: buildAllSeedEntities(),
        items: [],
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

  const backfillItineraryEntities = async () => {
    setBackfilling(true);
    setNotice(null);
    setError(null);
    try {
      const created = await seedEntitiesIfNew(nycSeedEntities());
      setNotice(
        created > 0
          ? `Added ${created} itinerary ${created === 1 ? "place" : "places"} — they'll now resolve in the calendar.`
          : "All itinerary places are already in the database."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Back-fill failed — see console.");
    } finally {
      setBackfilling(false);
    }
  };

  // --- batch selection -------------------------------------------------------

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  // Only ever act on rows the user can currently see. Selections from a previous
  // filter stay remembered but are never silently deleted/parked while hidden.
  const selectedVisible = filtered.filter((e) => selected.has(e.id)).map((e) => e.id);
  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));
  const toggleAllFiltered = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allFilteredSelected) filtered.forEach((e) => n.delete(e.id));
      else filtered.forEach((e) => n.add(e.id));
      return n;
    });

  const bulkPark = async (t: EntityType) => {
    if (!selectedVisible.length) return;
    const n = selectedVisible.length;
    setBulkBusy(true);
    setError(null);
    try {
      await bulkUpdateEntities(selectedVisible, { type: t });
      setNotice(`Parked ${n} ${n === 1 ? "entity" : "entities"} as ${t}.`);
      exitSelect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!selectedVisible.length) return;
    const n = selectedVisible.length;
    if (!confirm(`Delete ${n} ${n === 1 ? "entity" : "entities"} from the database? This cannot be undone.`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      await bulkDeleteEntities(selectedVisible);
      setNotice(`Deleted ${n} ${n === 1 ? "entity" : "entities"}.`);
      exitSelect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk delete failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <AppHeader title="Database" subtitle="Master catalog of all entities" backHref="/" />

      {loaded && entities.length === 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <p className="font-medium text-indigo-900">The Database is empty.</p>
          <p className="mt-1 text-indigo-700">
            Seed it once from the bundled lists. This writes every entity and the NYC trip into the
            database so you can edit them.
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
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                selectMode
                  ? "border-ink bg-ink text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {selectMode ? "Done" : "Select"}
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
            {isAdmin && (
              <button
                onClick={backfillItineraryEntities}
                disabled={backfilling}
                title="Ensure every itinerary place (Deans, Seneca Village, Lil' Deb's, etc.) exists in the DB with its correct ID"
                className="rounded-lg border border-teal-300 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
              >
                {backfilling ? "Adding…" : "Fix itinerary IDs"}
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
            {calSourceCount > 0 && (
              <button
                onClick={() => setCalSourceOnly((v) => !v)}
                className={`rounded-full px-2.5 py-1 font-medium ${calSourceOnly ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
              >
                📅 From calendar <span className={calSourceOnly ? "opacity-70" : "text-amber-400"}>{calSourceCount}</span>
              </button>
            )}
            {dupCount > 0 && (
              <button
                onClick={() => setDupOnly((v) => !v)}
                className={`rounded-full px-2.5 py-1 font-medium ${dupOnly ? "bg-rose-500 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}
              >
                ⚠ Duplicates <span className={dupOnly ? "opacity-70" : "text-rose-400"}>{dupCount}</span>
              </button>
            )}
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

          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              {filtered.length} of {entities.length} entities
            </span>
            {selectMode && filtered.length > 0 && (
              <button onClick={toggleAllFiltered} className="font-medium text-ink hover:underline">
                {allFilteredSelected ? "Clear all" : `Select all ${filtered.length}`}
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {filtered.map((e) => (
              <li
                key={e.id}
                className={`flex items-start gap-2 px-4 py-3 ${
                  selectMode && selected.has(e.id) ? "bg-indigo-50" : ""
                }`}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggleSel(e.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-ink"
                  />
                )}
                <button
                  onClick={() => (selectMode ? toggleSel(e.id) : setViewing(e))}
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
                    {usedEntityIds.has(e.id) && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        ✓ in itinerary
                      </span>
                    )}
                    {isDup(e.name) && (
                      <span
                        title={usedEntityIds.has(e.id) ? "Another entity shares this name — but this is the one wired to the itinerary, so keep it." : "Another entity shares this name. If the other one is 'in itinerary', this one is the safe-to-delete duplicate."}
                        className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                      >
                        ⚠ duplicate
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-300">{e.id}</div>
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
                {!selectMode && (
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
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Batch action bar — sticky at the bottom, thumb-friendly on mobile */}
      {selectMode && selectedVisible.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{selectedVisible.length} selected</span>
            {isAdmin && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) bulkPark(e.target.value as EntityType); }}
                disabled={bulkBusy}
                title="File the selected entities into a logistics/misc bucket"
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <option value="">Park…</option>
                <option value="travel">✈️ Travel</option>
                <option value="admin">📋 Admin</option>
                <option value="uncategorised">❓ Misc</option>
              </select>
            )}
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {bulkBusy ? "Working…" : "Delete"}
            </button>
            <button
              onClick={exitSelect}
              className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewing && (
        <EntityDetail
          entity={{ ...viewing, slots: [] }}
          allDbEntities={entities}
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
 * Compact "park this somewhere harmless" control. Files a logistics entity
 * into a bucket type (Travel / Admin / Misc) so it stops appearing in place lists.
 */
function ParkSelect({ onPark }: { onPark: (t: EntityType) => void }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPark(e.target.value as EntityType);
      }}
      title="Re-type this entity as a logistics/misc bucket"
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
