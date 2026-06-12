"use client";

// PROTOTYPE itinerary grid — a Google-Calendar-style day/week view backed by the
// throwaway sample data in lib/preview-data.ts. Everything lives in local state:
// drag to move (across days too), drag either edge to resize, tap to open a rich
// detail sheet, edit notes, swap Plan B, and add slots. Nothing persists.

import { useMemo, useRef, useState } from "react";
import { ENTITY_TABS } from "@/lib/entities";
import {
  PREVIEW_ENTITIES,
  PREVIEW_SLOTS,
  PREVIEW_INSTANCES,
  PREVIEW_STAYS,
  TRIP_DAYS,
  TYPE_COLORS,
  type Capacity,
  type PreviewEntity,
  type PreviewInstance,
} from "@/lib/preview-data";

const DAY_START_H = 6;
const DAY_END_H = 28; // 4am next day
const PX_PER_HOUR = 68;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP = 15;
const HEADER_H = 40;
const GRID_H = (DAY_END_H - DAY_START_H) * PX_PER_HOUR;

const emojiOf = (type: string) => ENTITY_TABS.find((t) => t.type === type)?.emoji ?? "•";
const parseMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
function fmt(min: number): string {
  let h = Math.floor(min / 60); const m = min % 60;
  const am = h < 12 || h >= 24 ? "am" : "pm"; h = h % 24;
  let hh = h % 12; if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${am}` : `${hh}:${String(m).padStart(2, "0")}${am}`;
}
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const igUrl = (h: string) => (h.startsWith("http") ? h : `https://instagram.com/${h.replace(/^@/, "")}`);

type SlotTime = { day: string; start: number; end: number };

export function ItineraryGrid() {
  const [entities, setEntities] = useState<PreviewEntity[]>(PREVIEW_ENTITIES);
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const [slotTime, setSlotTime] = useState<Record<string, SlotTime>>(() => {
    const t: Record<string, SlotTime> = {};
    for (const s of PREVIEW_SLOTS) {
      const start = parseMin(s.start);
      t[s.id] = { day: s.day, start, end: s.end ? parseMin(s.end) : start + 90 };
    }
    return t;
  });
  const [labels, setLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(PREVIEW_SLOTS.map((s) => [s.id, s.label]))
  );
  const [instances, setInstances] = useState<PreviewInstance[]>(PREVIEW_INSTANCES);
  const [detailSlot, setDetailSlot] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [dayIdx, setDayIdx] = useState(1); // start on Fri Jun 19
  const newCounter = useRef(0);

  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const days = view === "day" ? [TRIP_DAYS[dayIdx]] : TRIP_DAYS;

  const slotsByDay = (day: string) =>
    PREVIEW_SLOTS.filter((s) => slotTime[s.id].day === day).map((s) => s.id);

  const moveSlot = (slotId: string, next: SlotTime) =>
    setSlotTime((p) => ({ ...p, [slotId]: next }));

  const makeMain = (slotId: string, entityId: string) =>
    setInstances((prev) => prev.map((i) =>
      i.slotId !== slotId ? i
      : i.entityId === entityId ? { ...i, capacity: "confirmed" as Capacity }
      : i.capacity !== "planB" ? { ...i, capacity: "planB" as Capacity }
      : i));

  const updateInstance = (slotId: string, entityId: string, patch: Partial<PreviewInstance>) =>
    setInstances((prev) => prev.map((i) =>
      i.slotId === slotId && i.entityId === entityId ? { ...i, ...patch } : i));

  const addSlot = (day: string, startMin: number) => {
    const id = `new-${newCounter.current++}`;
    const eid = `new-ent-${id}`;
    const start = clamp(snap(startMin), DAY_START_H * 60, DAY_END_H * 60 - 60);
    PREVIEW_SLOTS.push({ id, day, start: fmt(start), label: "New activity" });
    setEntities((p) => [...p, { id: eid, name: "New activity", type: "uncategorised" }]);
    setLabels((p) => ({ ...p, [id]: "New activity" }));
    setSlotTime((p) => ({ ...p, [id]: { day, start, end: start + 60 } }));
    setInstances((p) => [...p, { slotId: id, entityId: eid, capacity: "confirmed", note: "" }]);
    setDetailSlot(id);
  };

  return (
    <div className="select-none">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-ink text-white" : "text-slate-500"}`}>
              {v}
            </button>
          ))}
        </div>
        {view === "day" ? (
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setDayIdx((i) => Math.max(0, i - 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
            <span className="min-w-[7rem] text-center font-semibold text-slate-700">
              {new Date(TRIP_DAYS[dayIdx] + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
            </span>
            <button onClick={() => setDayIdx((i) => Math.min(TRIP_DAYS.length - 1, i + 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto">
            {TRIP_DAYS.map((d, i) => {
              const dt = new Date(d + "T12:00:00");
              return (
                <button key={d} onClick={() => dayRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} <span className="text-slate-400">{dt.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative flex overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ height: "72vh" }}>
        {/* Time gutter */}
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-100 bg-white" style={{ height: GRID_H + HEADER_H }}>
          <div style={{ height: HEADER_H }} />
          {Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => (
            <div key={i} className="absolute right-1 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: HEADER_H + i * PX_PER_HOUR }}>
              {fmt(((DAY_START_H + i) % 24) * 60)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const dt = new Date(day + "T12:00:00");
          const ids = slotsByDay(day);
          const stays = PREVIEW_STAYS.filter((s) => day >= s.from && day < s.to);
          const layout = layoutColumns(ids.map((id) => ({ id, ...slotTime[id] })));
          const realIdx = TRIP_DAYS.indexOf(day);
          return (
            <div key={day} ref={(el) => { dayRefs.current[realIdx] = el; }} data-day={day}
              className="relative shrink-0 border-r border-slate-100 last:border-r-0"
              style={{ height: GRID_H + HEADER_H, width: view === "day" ? "100%" : "var(--col-w)" }}>
              {/* Day header */}
              <div className="sticky top-0 z-10 flex flex-col justify-center border-b border-slate-100 bg-white/95 px-2 backdrop-blur" style={{ height: HEADER_H }}>
                <div className="text-xs font-semibold text-slate-700">
                  {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} <span className="text-slate-400">{dt.getUTCDate()}</span>
                </div>
                {stays.length > 0 && (
                  <div className="truncate text-[10px] text-indigo-500" title={stays.map((s) => s.name).join(", ")}>🛏 {stays[0].name}</div>
                )}
              </div>

              {/* Click-to-add layer + gridlines */}
              <div className="absolute inset-x-0" style={{ top: HEADER_H, height: GRID_H }}
                onClick={(e) => { if (e.target === e.currentTarget) addSlot(day, DAY_START_H * 60 + e.nativeEvent.offsetY / PX_PER_MIN); }}>
                {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (
                  <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-slate-50" style={{ top: i * PX_PER_HOUR }} />
                ))}
                {ids.map((id) => {
                  const t = slotTime[id];
                  const lay = layout.get(id)!;
                  const { main, alts } = splitInstances(id, instances);
                  if (!main) return null;
                  return (
                    <Block key={id} t={t} main={main} alts={alts} entityById={entityById}
                      col={lay.col} colCount={lay.count}
                      onChange={(next) => moveSlot(id, next)} onOpen={() => setDetailSlot(id)} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-center text-xs text-slate-400">
        Drag to move (across days too) · drag top/bottom edge to resize · tap empty space to add · tap a block to open
      </p>

      {detailSlot && (
        <DetailSheet slotId={detailSlot} instances={instances} entityById={entityById}
          t={slotTime[detailSlot]} label={labels[detailSlot]}
          onMakeMain={(eid) => makeMain(detailSlot, eid)}
          onUpdate={(eid, patch) => updateInstance(detailSlot, eid, patch)}
          onClose={() => setDetailSlot(null)} />
      )}

      <style>{`:root{--col-w:84vw}@media(min-width:768px){:root{--col-w:172px}}`}</style>
    </div>
  );
}

// --- block -------------------------------------------------------------------

function Block({
  t, main, alts, entityById, col, colCount, onChange, onOpen,
}: {
  t: SlotTime; main: PreviewInstance; alts: PreviewInstance[];
  entityById: Map<string, PreviewEntity>; col: number; colCount: number;
  onChange: (next: SlotTime) => void; onOpen: () => void;
}) {
  const entity = entityById.get(main.entityId);
  const type = entity?.type ?? "uncategorised";
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;
  const drag = useRef<{ mode: "move" | "top" | "bottom"; y0: number; s0: number; e0: number; moved: boolean } | null>(null);

  const top = (t.start - DAY_START_H * 60) * PX_PER_MIN;
  const height = Math.max(22, (t.end - t.start) * PX_PER_MIN);
  const widthPct = 100 / colCount;
  const planned = main.capacity === "planned";

  const down = (mode: "move" | "top" | "bottom") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, y0: e.clientY, s0: t.start, e0: t.end, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dm = snap((e.clientY - d.y0) / PX_PER_MIN);
    if (Math.abs(e.clientY - d.y0) > 4) d.moved = true;
    if (d.mode === "move") {
      const dur = d.e0 - d.s0;
      const start = clamp(d.s0 + dm, DAY_START_H * 60, DAY_END_H * 60 - dur);
      // cross-day: find the column under the pointer
      const col = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-day]");
      const day = col?.getAttribute("data-day") ?? t.day;
      onChange({ day, start, end: start + dur });
    } else if (d.mode === "bottom") {
      onChange({ ...t, end: clamp(d.e0 + dm, d.s0 + SNAP, DAY_END_H * 60) });
    } else {
      onChange({ ...t, start: clamp(d.s0 + dm, DAY_START_H * 60, d.e0 - SNAP) });
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) onOpen();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const bookIcon = main.needsBooking ? (main.booked ? "✅" : "📋") : null;

  return (
    <div className={`group absolute overflow-hidden rounded-lg border-l-4 ${c.bg} ${c.border} ${c.text} shadow-sm ring-1 ring-black/5 ${planned ? "border-dashed" : ""}`}
      style={{ top, height, left: `calc(${col * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, touchAction: "none", cursor: "grab" }}
      onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onClick={(e) => e.stopPropagation()}>
      {/* top resize */}
      <div className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize" onPointerDown={down("top")} onPointerMove={move} onPointerUp={up} />

      <div className="px-1.5 py-1">
        <div className="flex items-start gap-1">
          <span className="text-[11px] leading-tight">{emojiOf(type)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold leading-tight">{entity?.name}</div>
            {height > 30 && (
              <div className="truncate text-[10px] opacity-70">
                {fmt(t.start)}{height > 44 ? `–${fmt(t.end)}` : ""}
                {entity?.parent ? ` · @${entity.parent}` : entity?.area ? ` · ${entity.area}` : ""}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {bookIcon && <span className="text-[10px]" title={main.booked ? "Booked" : "Needs booking"}>{bookIcon}</span>}
            {planned && <span className="rounded bg-black/10 px-1 text-[8px] font-bold uppercase">plan</span>}
            {alts.length > 0 && <span className={`rounded-full ${c.chip} px-1 text-[9px] font-bold text-white`}>+{alts.length}</span>}
          </div>
        </div>

        {height > 58 && main.note && (
          <div className="mt-0.5 line-clamp-1 text-[10px] opacity-60">{main.note}</div>
        )}
        {height > 76 && alts.length > 0 && (
          <div className="mt-0.5 space-y-px">
            {alts.slice(0, 2).map((a) => (
              <div key={a.entityId} className="truncate text-[9px] opacity-55">▹ {entityById.get(a.entityId)?.name}</div>
            ))}
            {alts.length > 2 && <div className="text-[9px] opacity-45">+{alts.length - 2} more</div>}
          </div>
        )}
      </div>

      {/* bottom resize */}
      <div className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize" onPointerDown={down("bottom")} onPointerMove={move} onPointerUp={up}>
        <div className="mx-auto mt-0.5 h-0.5 w-5 rounded-full bg-current opacity-0 group-hover:opacity-30" />
      </div>
    </div>
  );
}

// --- detail sheet ------------------------------------------------------------

function DetailSheet({
  slotId, instances, entityById, t, label, onMakeMain, onUpdate, onClose,
}: {
  slotId: string; instances: PreviewInstance[]; entityById: Map<string, PreviewEntity>;
  t: SlotTime; label: string;
  onMakeMain: (entityId: string) => void;
  onUpdate: (entityId: string, patch: Partial<PreviewInstance>) => void;
  onClose: () => void;
}) {
  const { main, alts } = splitInstances(slotId, instances);
  const ent = main ? entityById.get(main.entityId) : undefined;
  const [note, setNote] = useState(main?.note ?? "");
  if (!main || !ent) return null;
  const type = ent.type;
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`mb-1 inline-flex items-center gap-1 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-[11px] font-medium`}>{emojiOf(type)} {type}</span>
            <h2 className="text-lg font-semibold leading-snug">{ent.name}</h2>
            <div className="mt-0.5 text-xs text-slate-500">{fmt(t.start)} – {fmt(t.end)}{ent.parent ? ` · @${ent.parent}` : ent.area ? ` · ${ent.area}` : ""}</div>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {/* Contact / facts */}
        <div className="space-y-1 text-sm">
          {ent.address && <a href={mapsUrl(ent.address)} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-slate-600 hover:text-ink"><span>📍</span><span className="underline decoration-slate-300">{ent.address}</span></a>}
          {ent.hours && <div className="flex items-start gap-2 text-slate-600"><span>🕑</span><span>{ent.hours}</span></div>}
          {ent.website && <a href={ent.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:underline"><span>🔗</span><span className="truncate">{ent.website.replace(/^https?:\/\//, "")}</span></a>}
          {ent.instagram && <a href={igUrl(ent.instagram)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-pink-600 hover:underline"><span>📸</span><span>{ent.instagram}</span></a>}
          {ent.phone && <a href={`tel:${ent.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-slate-600 hover:underline"><span>📞</span><span>{ent.phone}</span></a>}
        </div>

        {/* Booking */}
        {main.needsBooking != null && (
          <div className="mt-3 flex items-center gap-2">
            {main.needsBooking ? (
              <button onClick={() => onUpdate(main.entityId, { booked: !main.booked })}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${main.booked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {main.booked ? "✅ Booked — tap to unset" : "📋 Needs booking — tap when done"}
              </button>
            ) : <span className="text-xs text-slate-400">No booking needed</span>}
          </div>
        )}

        {/* Editable note */}
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => onUpdate(main.entityId, { note })} rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Notes for this visit…" />
        </div>

        {/* Plan B */}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Competing options for this slot</p>
          <ul className="space-y-1.5">
            <OptionRow ent={ent} isMain />
            {alts.map((a) => { const e = entityById.get(a.entityId); return e ? <OptionRow key={a.entityId} ent={e} onMakeMain={() => onMakeMain(a.entityId)} /> : null; })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Only the main option exports to Google Calendar. “Make main” swaps it in.</p>
        </div>

        {/* Entity link + comments */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <a href="/database" className="text-sm font-medium text-indigo-600 hover:underline">{emojiOf(type)} Edit {ent.name} in Database →</a>
        </div>
        <p className="mt-2 text-xs text-slate-400">💬 comments · 📷 photos — live once wired to the trip</p>
      </div>
    </div>
  );
}

function OptionRow({ ent, isMain, onMakeMain }: { ent: PreviewEntity; isMain?: boolean; onMakeMain?: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
      <span>{emojiOf(ent.type)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ent.name}</div>
        {ent.area && <div className="text-[11px] text-slate-400">{ent.parent ? `@${ent.parent}` : ent.area}</div>}
      </div>
      {isMain
        ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span>
        : <button onClick={onMakeMain} className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">make main ⇄</button>}
    </li>
  );
}

// --- helpers -----------------------------------------------------------------

function splitInstances(slotId: string, instances: PreviewInstance[]) {
  const all = instances.filter((i) => i.slotId === slotId);
  const main = all.find((i) => i.capacity !== "planB");
  const alts = all.filter((i) => i !== main);
  return { main, alts };
}

function layoutColumns(blocks: { id: string; start: number; end: number }[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const result = new Map<string, { col: number; count: number }>();
  let group: typeof sorted = []; let groupMaxEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    for (const b of group) {
      let placed = -1;
      for (let i = 0; i < colEnds.length; i++) if (colEnds[i] <= b.start) { colEnds[i] = b.end; placed = i; break; }
      if (placed === -1) { placed = colEnds.length; colEnds.push(b.end); }
      result.set(b.id, { col: placed, count: 0 });
    }
    for (const b of group) result.get(b.id)!.count = colEnds.length;
    group = []; groupMaxEnd = -1;
  };
  for (const b of sorted) { if (group.length && b.start >= groupMaxEnd) flush(); group.push(b); groupMaxEnd = Math.max(groupMaxEnd, b.end); }
  if (group.length) flush();
  return result;
}
