"use client";

import { useEffect, useMemo, useState } from "react";
import { bookings, distinct } from "@/lib/planning";
import {
  buildEntities,
  groupByType,
  ENTITY_TABS,
  type Entity,
  type EntityType,
  type TripSlot,
  type ItinDay,
} from "@/lib/entities";

type Tab = EntityType | "bookings";

export function PlanningTab() {
  const [days, setDays] = useState<ItinDay[]>([]);
  const [tz, setTz] = useState("Europe/London");
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("food");

  useEffect(() => {
    fetch("/api/itinerary")
      .then((r) => r.json())
      .then((d: { days?: ItinDay[]; tz?: string }) => {
        setDays(d.days ?? []);
        setTz(d.tz ?? "Europe/London");
      })
      .finally(() => setLoaded(true));
  }, []);

  const grouped = useMemo(() => groupByType(buildEntities(days, tz)), [days, tz]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5 text-sm">
        {ENTITY_TABS.map((t) => (
          <TabChip key={t.type} active={tab === t.type} onClick={() => setTab(t.type)}>
            {t.emoji} {t.label}{" "}
            <span className="text-slate-400">{grouped[t.type]?.length ?? 0}</span>
          </TabChip>
        ))}
        <TabChip active={tab === "bookings"} onClick={() => setTab("bookings")}>
          ✅ Bookings <span className="text-slate-400">{bookings.length}</span>
        </TabChip>
      </div>

      {!loaded && tab !== "bookings" ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">
          Loading entities…
        </p>
      ) : tab === "bookings" ? (
        <BookingsList />
      ) : (
        <EntityList entities={grouped[tab] ?? []} />
      )}
    </div>
  );
}

function EntityList({ entities }: { entities: Entity[] }) {
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
            <EntityCard key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntityCard({ e }: { e: Entity }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
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
              <span className="text-xs text-slate-300">not in the plan yet</span>
            ) : (
              e.slots.map((s, i) => <SlotBadge key={i} s={s} />)
            )}
          </div>
        </div>
        <span className="shrink-0 text-slate-300">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 text-sm">
          {e.notes && <p className="text-slate-600">{e.notes}</p>}
          <dl className="mt-2 space-y-1 text-xs text-slate-500">
            {e.generalArea && <Row label="Region">{e.generalArea}</Row>}
            {e.hours && <Row label="Hours">{e.hours}</Row>}
            {e.address && <Row label="Address">{e.address}</Row>}
            {e.bestDay && <Row label="Best day">{e.bestDay}</Row>}
            {e.booking && <Row label="Booking">{e.booking}</Row>}
            {e.source && <Row label="Source">{e.source}</Row>}
          </dl>
          {e.slots.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Where it fits the trip
              </div>
              <ul className="space-y-1">
                {e.slots.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <SlotBadge s={s} />
                    {s.note && <span className="text-slate-400">{s.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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
  const prefix = s.kind === "confirmed" ? "✅" : s.kind === "planB" ? "🅱" : "📌";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[s.kind]}`}>
      {prefix} {s.label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-medium text-slate-400">{label}</dt>
      <dd className="text-slate-600">{children}</dd>
    </div>
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
