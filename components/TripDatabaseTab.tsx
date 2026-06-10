"use client";

import { useMemo, useState } from "react";
import { distinct } from "@/lib/planning";
import {
  groupByType,
  ENTITY_TABS,
  OPERATIONAL_TYPES,
  type Entity,
  type EntityType,
} from "@/lib/entities";
import { useTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { EntityDetail } from "./EntityDetail";
import { saveTripItem } from "@/lib/db";
import { slugId } from "@/lib/slug";

type Tab = EntityType | "all";

export function TripDatabaseTab() {
  const { entities, loading, seeded, tripId } = useTripData();
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [tab, setTab] = useState<Tab>("all");
  const [showOperational, setShowOperational] = useState(false);

  const grouped = useMemo(() => groupByType(entities), [entities]);
  const visibleTabs = ENTITY_TABS.filter((t) => showOperational || !t.operational);

  const listed =
    tab === "all"
      ? entities.filter((e) => showOperational || !OPERATIONAL_TYPES.has(e.type))
      : (grouped[tab as EntityType] ?? []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        <TabChip active={tab === "all"} onClick={() => setTab("all")}>
          All <span className="text-slate-400">{entities.filter((e) => showOperational || !OPERATIONAL_TYPES.has(e.type)).length}</span>
        </TabChip>
        {visibleTabs.map((t) => (
          <TabChip key={t.type} active={tab === t.type} onClick={() => setTab(t.type as Tab)}>
            {t.emoji} {t.label}{" "}
            <span className="text-slate-400">{grouped[t.type]?.length ?? 0}</span>
          </TabChip>
        ))}
        <button
          onClick={() => { setShowOperational((v) => !v); if (tab !== "all" && OPERATIONAL_TYPES.has(tab as EntityType)) setTab("all"); }}
          className="rounded-full px-3 py-1.5 font-medium text-slate-400 bg-slate-50 hover:bg-slate-100 text-sm"
        >
          {showOperational ? "Hide" : "Show"} admin/travel
        </button>
      </div>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          Loading…
        </p>
      ) : listed.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          Nothing here yet.
        </p>
      ) : (
        <DBEntityList entities={listed} canEdit={canEdit && seeded} tripId={tripId} />
      )}
    </div>
  );
}

function DBEntityList({
  entities,
  canEdit,
  tripId,
}: {
  entities: Entity[];
  canEdit: boolean;
  tripId: string;
}) {
  const areas = useMemo(() => distinct(entities, (e) => e.area ?? ""), [entities]);
  const generalAreas = useMemo(() => distinct(entities, (e) => e.generalArea ?? ""), [entities]);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [generalArea, setGeneralArea] = useState("");

  const filtered = entities.filter((e) => {
    if (generalArea && e.generalArea !== generalArea) return false;
    if (area && e.area !== area) return false;
    if (q) {
      const hay = `${e.name} ${e.area ?? ""} ${e.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
        {generalAreas.filter(Boolean).length > 1 && (
          <select
            value={generalArea}
            onChange={(e) => setGeneralArea(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium shadow-sm"
          >
            <option value="">All regions</option>
            {generalAreas.filter(Boolean).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
        {areas.length > 1 && (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="">All areas</option>
            {areas.filter(Boolean).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
      </div>

      <p className="mb-2 text-xs text-slate-400">
        {filtered.length} of {entities.length} entities
      </p>
      <ul className="space-y-2">
        {filtered.map((e) => (
          <DBEntityCard key={e.id} e={e} canEdit={canEdit} tripId={tripId} />
        ))}
      </ul>
    </div>
  );
}

function DBEntityCard({ e, canEdit, tripId }: { e: Entity; canEdit: boolean; tripId: string }) {
  const { tripName } = useTripData();
  const [showDetail, setShowDetail] = useState(false);
  const typeTab = ENTITY_TABS.find((t) => t.type === e.type || (e.type === "party" && t.type === "club"));
  const confirmedCount = e.slots.filter((s) => s.kind === "confirmed").length;
  const plannedCount = e.slots.filter((s) => s.kind !== "confirmed").length;

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 p-4">
        <button onClick={() => setShowDetail(true)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base">{typeTab?.emoji}</span>
            <h3 className="font-medium">{e.name}</h3>
            {e.closed && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                CLOSED
              </span>
            )}
            {e.transient && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                from calendar
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {e.generalArea && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {e.generalArea}
              </span>
            )}
            {e.area && <span>{e.area}</span>}
            {e.hours && <span>🕑 {e.hours}</span>}
            {e.price && <span className="font-medium">{e.price}</span>}
          </div>

          {e.notes && (
            <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{e.notes}</p>
          )}

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            {confirmedCount > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                ✅ {confirmedCount} in schedule
              </span>
            )}
            {plannedCount > 0 && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                📌 {plannedCount} planned
              </span>
            )}
            {e.slots.length === 0 && (
              <span className="text-slate-300">no appearances yet</span>
            )}
          </div>
        </button>

        {canEdit && !e.transient && (
          <button
            onClick={() =>
              saveTripItem(tripId, {
                entityId: e.id.startsWith("new:") ? slugId(e.type, e.name) : e.id,
                removed: true,
                added: false,
              })
            }
            title="Remove from trip"
            className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-400 hover:border-rose-200 hover:text-rose-600"
          >
            ✕
          </button>
        )}
      </div>

      {showDetail && (
        <EntityDetail entity={e} tripId={tripId} tripName={tripName} onClose={() => setShowDetail(false)} />
      )}
    </li>
  );
}

function TabChip({
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
      className={`rounded-full px-3 py-1.5 font-medium transition ${
        active ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
