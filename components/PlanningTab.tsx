"use client";

import { useMemo, useState } from "react";
import { bookings, distinct } from "@/lib/planning";
import {
  groupByType,
  ENTITY_TABS,
  OPERATIONAL_TYPES,
  type Entity,
  type EntityType,
  type TripSlot,
} from "@/lib/entities";
import { useTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { EntityDetail } from "./EntityDetail";
import { saveTripItem } from "@/lib/db";
import { slugId } from "@/lib/slug";
import { exportEntities } from "@/lib/export";

type Tab = EntityType | "bookings";

export function PlanningTab() {
  const { entities, loading, seeded, tripId } = useTripData();
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [tab, setTab] = useState<Tab>("food");
  const [showOperational, setShowOperational] = useState(false);

  const grouped = useMemo(() => groupByType(entities), [entities]);
  const visibleTabs = ENTITY_TABS.filter((t) => showOperational || !t.operational);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        {visibleTabs.map((t) => (
          <TabChip key={t.type} active={tab === t.type} onClick={() => setTab(t.type)}>
            {t.emoji} {t.label}{" "}
            <span className="text-slate-400">{grouped[t.type]?.length ?? 0}</span>
          </TabChip>
        ))}
        <button
          onClick={() => { setShowOperational((v) => !v); if (OPERATIONAL_TYPES.has(tab as EntityType)) setTab("food"); }}
          className="rounded-full px-3 py-1.5 font-medium text-slate-400 bg-slate-50 hover:bg-slate-100 text-sm"
        >
          {showOperational ? "Hide" : "Show"} admin/travel
        </button>
        <TabChip active={tab === "bookings"} onClick={() => setTab("bookings")}>
          ✅ Bookings <span className="text-slate-400">{bookings.length}</span>
        </TabChip>
      </div>

      {tab !== "bookings" && (
        <ExportBar entities={grouped[tab] ?? []} name={`${tab}-${tripId}`} />
      )}

      {loading && tab !== "bookings" ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          Loading entities…
        </p>
      ) : tab === "bookings" ? (
        <BookingsList />
      ) : (
        <EntityList entities={grouped[tab] ?? []} canEdit={canEdit && seeded} tripId={tripId} />
      )}
    </div>
  );
}

function ExportBar({ entities, name }: { entities: Entity[]; name: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
      <span>Export:</span>
      {(["csv", "excel", "word"] as const).map((f) => (
        <button
          key={f}
          onClick={() => exportEntities(entities, f, name)}
          className="rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-50"
        >
          {f === "csv" ? "CSV" : f === "excel" ? "Excel" : "Word"}
        </button>
      ))}
    </div>
  );
}

async function toggleMembership(tripId: string, e: Entity, remove: boolean) {
  const id = e.transient ? slugId(e.type, e.name) : e.id;
  await saveTripItem(tripId, { entityId: id, removed: remove, added: !remove });
}

function EntityList({
  entities,
  canEdit,
  tripId,
}: {
  entities: Entity[];
  canEdit: boolean;
  tripId: string;
}) {
  const { removedEntities } = useTripData();
  const areas = useMemo(() => distinct(entities, (e) => e.area ?? ""), [entities]);
  const generalAreas = useMemo(() => distinct(entities, (e) => e.generalArea ?? ""), [entities]);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [generalArea, setGeneralArea] = useState("");
  const [scheduledOnly, setScheduledOnly] = useState(false);

  const filtered = entities.filter((e) => {
    if (generalArea && e.generalArea !== generalArea) return false;
    if (area && e.area !== area) return false;
    if (scheduledOnly && !e.slots.some((s) => s.kind === "confirmed")) return false;
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
              <option key={a} value={a}>
                {a}
              </option>
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
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={scheduledOnly}
            onChange={(e) => setScheduledOnly(e.target.checked)}
          />
          In trip
        </label>
      </div>

      <p className="mb-2 text-xs text-slate-400">
        Showing {filtered.length} of {entities.length}
      </p>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          Nothing here yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <EntityCard key={e.id} e={e} canEdit={canEdit} tripId={tripId} />
          ))}
        </ul>
      )}

      {canEdit && removedEntities.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            Removed from this trip ({removedEntities.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {removedEntities.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-500">{d.name}</span>
                <button
                  onClick={() => saveTripItem(tripId, { entityId: d.id, removed: false, added: false })}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-white"
                >
                  Add back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EntityCard({ e, canEdit, tripId }: { e: Entity; canEdit: boolean; tripId: string }) {
  const { tripName } = useTripData();
  const [showDetail, setShowDetail] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-2 p-4">
        <button onClick={() => setShowDetail(true)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{e.name}</h3>
            {e.closed && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                CLOSED
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {e.area && <span>{e.area}</span>}
            {e.price && <span className="font-medium">{e.price}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {e.slots.length === 0 ? (
              <span className="text-xs text-slate-300">not placed yet</span>
            ) : (
              e.slots.map((s, i) => <SlotBadge key={i} s={s} />)
            )}
          </div>
        </button>
        {canEdit && !e.transient && (
          <button
            onClick={() => toggleMembership(tripId, e, true)}
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

function SlotBadge({ s }: { s: TripSlot }) {
  if (s.mismatch) {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
        ⚠️ {s.label} · differs from calendar
      </span>
    );
  }
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-50 text-emerald-700",
    planned: "bg-indigo-50 text-indigo-700",
    planB: "bg-amber-50 text-amber-700",
  };
  let label: string;
  if (s.kind === "confirmed") {
    label = `✅ In Schedule · ${s.label}`;
  } else if (s.kind === "planB") {
    label = s.dayKey ? `Plan B · ${s.label}` : "Plan B";
  } else {
    label = s.dayKey ? `Alt · ${s.label}` : "General Alternative";
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[s.kind]}`}>
      {label}
    </span>
  );
}

function BookingsList() {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const statuses = useMemo(() => distinct(bookings, (b) => b.status), []);
  const priorities = useMemo(() => distinct(bookings, (b) => b.priority), []);
  const filtered = bookings.filter(
    (b) => (!status || b.status === status) && (!priority || b.priority === priority)
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Any priority</option>
          {priorities.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ul className="space-y-2">
        {filtered.map((b, i) => {
          const done = /done|booked/i.test(b.status);
          return (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{b.task}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {b.status || "—"}
                </span>
              </div>
              {b.notes && <p className="mt-1.5 text-sm text-slate-600">{b.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                {b.priority && <span className="font-medium text-slate-500">{b.priority}</span>}
                {b.deadline && <span>⏰ {b.deadline}</span>}
                {b.cost && <span>💵 {b.cost}</span>}
                {b.platform && <span>{b.platform}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
