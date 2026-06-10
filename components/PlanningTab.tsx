"use client";

import { useMemo, useState } from "react";
import { restaurants, vintage, bookings, distinct, priceTier } from "@/lib/planning";

type Sub = "food" | "vintage" | "bookings";

export function PlanningTab() {
  const [sub, setSub] = useState<Sub>("food");
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        <SubBtn active={sub === "food"} onClick={() => setSub("food")}>
          🍴 Food <span className="text-slate-400">{restaurants.length}</span>
        </SubBtn>
        <SubBtn active={sub === "vintage"} onClick={() => setSub("vintage")}>
          👕 Vintage <span className="text-slate-400">{vintage.length}</span>
        </SubBtn>
        <SubBtn active={sub === "bookings"} onClick={() => setSub("bookings")}>
          ✅ Bookings <span className="text-slate-400">{bookings.length}</span>
        </SubBtn>
      </div>

      {sub === "food" && <FoodList />}
      {sub === "vintage" && <VintageList />}
      {sub === "bookings" && <BookingsList />}
    </div>
  );
}

function FoodList() {
  const areas = useMemo(() => distinct(restaurants, (r) => r.area), []);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [maxTier, setMaxTier] = useState(0);
  const [walkInOnly, setWalkInOnly] = useState(false);

  const filtered = restaurants.filter((r) => {
    if (area && r.area !== area) return false;
    if (maxTier && priceTier(r.price) > maxTier) return false;
    if (walkInOnly && !/walk-in/i.test(r.booking)) return false;
    if (q) {
      const hay = `${r.name} ${r.area} ${r.why} ${r.source}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <Filters>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search dishes, vibes, areas…"
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
        <Select value={area} onChange={setArea} placeholder="All areas" options={areas} />
        <Select
          value={maxTier ? String(maxTier) : ""}
          onChange={(v) => setMaxTier(Number(v))}
          placeholder="Any price"
          options={[
            ["1", "$ up to ~$20"],
            ["2", "$$ up to ~$40"],
            ["3", "$$$ up to ~$70"],
            ["4", "$$$$ any"],
          ]}
        />
        <Toggle checked={walkInOnly} onChange={setWalkInOnly}>
          Walk-in
        </Toggle>
      </Filters>

      <Count n={filtered.length} total={restaurants.length} />
      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{r.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{r.area}</span>
                {r.price && <span className="font-medium">{r.price}</span>}
                <BookingPill booking={r.booking} />
              </div>
            </div>
            {r.why && <p className="mt-1.5 text-sm text-slate-600">{r.why}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              {r.hours && <span>🕑 {r.hours}</span>}
              {r.days && <span>📅 {r.days}</span>}
              {r.source && <span>via {r.source}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingPill({ booking }: { booking: string }) {
  if (!booking) return null;
  const walkIn = /walk-in/i.test(booking);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        walkIn ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
      title={booking}
    >
      {walkIn ? "Walk-in" : "Book ahead"}
    </span>
  );
}

function VintageList() {
  const areas = useMemo(() => distinct(vintage, (v) => v.area), []);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");

  const filtered = vintage.filter((v) => {
    if (area && v.area !== area) return false;
    if (q) {
      const hay = `${v.name} ${v.area} ${v.vibe}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <Filters>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search shops, vibe…"
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
        <Select value={area} onChange={setArea} placeholder="All areas" options={areas} />
      </Filters>

      <Count n={filtered.length} total={vintage.length} />
      <ul className="space-y-2">
        {filtered.map((v) => (
          <li key={v.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{v.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{v.area}</span>
                {v.price && <span className="font-medium">{v.price}</span>}
              </div>
            </div>
            {v.vibe && <p className="mt-1.5 text-sm text-slate-600">{v.vibe}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              {v.address && <span>📍 {v.address}</span>}
              {v.hours && <span>🕑 {v.hours}</span>}
              {v.bestDay && <span>📅 {v.bestDay}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingsList() {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const statuses = useMemo(() => distinct(bookings, (b) => b.status), []);
  const priorities = useMemo(() => distinct(bookings, (b) => b.priority), []);

  const filtered = bookings.filter((b) => {
    if (status && b.status !== status) return false;
    if (priority && b.priority !== priority) return false;
    return true;
  });

  return (
    <div>
      <Filters>
        <Select value={priority} onChange={setPriority} placeholder="Any priority" options={priorities} />
        <Select value={status} onChange={setStatus} placeholder="Any status" options={statuses} />
      </Filters>

      <Count n={filtered.length} total={bookings.length} />
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

// --- shared UI bits --------------------------------------------------------

function SubBtn({
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
      className={`flex-1 rounded-md px-3 py-1.5 font-medium transition ${
        active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Filters({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: (string | [string, string])[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => {
        const [val, label] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={val} value={val}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function Count({ n, total }: { n: number; total: number }) {
  return (
    <p className="mb-2 text-xs text-slate-400">
      Showing {n} of {total}
    </p>
  );
}
