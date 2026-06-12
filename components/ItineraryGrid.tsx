"use client";

// Presentational itinerary calendar (Google-Calendar-style day/week/map view)
// plus the /preview local-state wrapper. The same <ItineraryCalendar> is reused
// by components/ItineraryBoard.tsx backed by Firestore. All data + mutations
// come in via props so this component holds only ephemeral UI state (view,
// selected day, open sheet, drag visuals).

import { useMemo, useRef, useState } from "react";
import { ENTITY_TABS, type EntityType } from "@/lib/entities";
import { buildTripIcs, downloadIcs, type IcsStay } from "@/lib/ics-export";
import { activityStatusOf, bookingStatusOf, type ActivityStatus, type BookingStatus, type Capacity } from "@/lib/itinerary";
import {
  PREVIEW_ENTITIES,
  PREVIEW_SLOTS,
  PREVIEW_INSTANCES,
  PREVIEW_STAYS,
} from "@/lib/preview-data";

const DAY_START_H = 6;
const DAY_END_H = 28; // 4am next day
const PX_PER_HOUR = 68;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP = 15;
const HEADER_H = 40;
const GRID_H = (DAY_END_H - DAY_START_H) * PX_PER_HOUR;

export type CalEntity = {
  id: string; name: string; type: EntityType;
  area?: string; parent?: string; address?: string; website?: string; instagram?: string; phone?: string; hours?: string;
};
export type CalSlot = { id: string; day: string; start: number; end: number; label: string };
export type CalInstance = { slotId: string; entityId: string; capacity: Capacity; note?: string; status?: ActivityStatus; bookingStatus?: BookingStatus; needsBooking?: boolean; booked?: boolean };

/** Editable place fields surfaced inside the itinerary popup (writes to the DB). */
export type EntityPatch = {
  name: string; type: EntityType;
  area?: string; address?: string; website?: string; instagram?: string; hours?: string; notes?: string;
};

export type CalHandlers = {
  onMoveSlot: (slotId: string, next: { day: string; start: number; end: number }) => void;
  onAddSlot: (slot: CalSlot, inst: CalInstance) => void;
  onDeleteSlot: (slotId: string, instanceIds: string[]) => void;
  onMakeMain: (slotId: string, entityId: string) => void;
  onUpdateInstance: (slotId: string, entityId: string, patch: Partial<CalInstance>) => void;
  onRenameSlot: (slotId: string, label: string) => void;
  /** Create/update the DB entity behind an instance (category + details). */
  onSaveEntity?: (entityId: string, patch: EntityPatch) => void;
  onGestureStart?: () => void;
};

const emojiOf = (type: string) => ENTITY_TABS.find((t) => t.type === type || (type === "party" && t.type === "club"))?.emoji ?? "•";
function fmt(min: number): string {
  let h = Math.floor(min / 60); const m = min % 60;
  const am = h < 12 || h >= 24 ? "am" : "pm"; h = h % 24;
  let hh = h % 12; if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${am}` : `${hh}:${String(m).padStart(2, "0")}${am}`;
}
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const igUrl = (h: string) => (h.startsWith("http") ? h : `https://instagram.com/${h.replace(/^@/, "")}`);

import { TYPE_COLORS } from "@/lib/preview-data";

function splitInstances(slotId: string, instances: CalInstance[]) {
  const all = instances.filter((i) => i.slotId === slotId);
  const main = all.find((i) => i.capacity !== "planB");
  const alts = all.filter((i) => i !== main);
  return { main, alts };
}

// =============================================================================
// Presentational calendar
// =============================================================================

export function ItineraryCalendar({
  calName, days, entityById, slots, instances, stays, canEdit, handlers, onUndo, canUndo,
}: {
  calName: string;
  days: string[];
  entityById: Map<string, CalEntity>;
  slots: CalSlot[];
  instances: CalInstance[];
  stays: IcsStay[];
  canEdit: boolean;
  handlers: CalHandlers;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const [detailSlot, setDetailSlot] = useState<string | null>(null);
  const [view, setView] = useState<"week" | "day" | "map">("week");
  const [dayIdx, setDayIdx] = useState(0);
  const newCounter = useRef(0);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const visibleDays = view === "week" ? days : [days[Math.min(dayIdx, days.length - 1)]];
  const slotsOn = (day: string) => slots.filter((s) => s.day === day);

  const exportIcs = () => {
    const ics = buildTripIcs({
      calName,
      slots: slots.map((s) => ({ id: s.id, day: s.day, start: s.start, end: s.end, label: s.label })),
      instances: instances.map((i) => ({ slotId: i.slotId, entityId: i.entityId, capacity: i.capacity, note: i.note })),
      entities: new Map([...entityById].map(([id, e]) => [id, { name: e.name, type: e.type, area: e.area, parent: e.parent, address: e.address }])),
      stays,
    });
    downloadIcs(ics, `${calName.replace(/\W+/g, "-").toLowerCase()}.ics`);
  };

  const addAt = (day: string, startMin: number) => {
    if (!canEdit) return;
    const id = `new-${Date.now()}-${newCounter.current++}`;
    const start = clamp(snap(startMin), DAY_START_H * 60, DAY_END_H * 60 - 60);
    const slot: CalSlot = { id, day, start, end: start + 60, label: "New activity" };
    const inst: CalInstance = { slotId: id, entityId: `adhoc:${id}`, capacity: "confirmed", note: "" };
    handlers.onAddSlot(slot, inst);
    setDetailSlot(id);
  };

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
            {(["day", "week", "map"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-ink text-white" : "text-slate-500"}`}>{v}</button>
            ))}
          </div>
          {onUndo && (
            <button onClick={onUndo} disabled={!canUndo} title="Undo"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${canUndo ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-slate-100 bg-slate-50 text-slate-300"}`}>↶ Undo</button>
          )}
          <button onClick={exportIcs} title="Export to a .ics calendar file"
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">⤓ Export .ics</button>
        </div>
        {view !== "week" && (
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setDayIdx((i) => Math.max(0, i - 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
            <span className="min-w-[7rem] text-center font-semibold text-slate-700">{new Date(visibleDays[0] + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</span>
            <button onClick={() => setDayIdx((i) => Math.min(days.length - 1, i + 1))} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
          </div>
        )}
        {view === "week" && (
          <div className="flex gap-1.5 overflow-x-auto">
            {days.map((d, i) => { const dt = new Date(d + "T12:00:00"); return (
              <button key={d} onClick={() => dayRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })} className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} <span className="text-slate-400">{dt.getUTCDate()}</span>
              </button>); })}
          </div>
        )}
      </div>

      <Legend />

      {view === "map" ? (
        <DayMap day={visibleDays[0]} slots={slotsOn(visibleDays[0])} instances={instances} entityById={entityById} />
      ) : (
        <div className="relative flex overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ height: "72vh" }}>
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-100 bg-white" style={{ height: GRID_H + HEADER_H }}>
            <div style={{ height: HEADER_H }} />
            {Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => (
              <div key={i} className="absolute right-1 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: HEADER_H + i * PX_PER_HOUR }}>{fmt(((DAY_START_H + i) % 24) * 60)}</div>
            ))}
          </div>

          {visibleDays.map((day) => {
            const dt = new Date(day + "T12:00:00");
            const daySlots = slotsOn(day);
            const dayStays = stays.filter((s) => day >= s.from && day < s.to);
            const layout = layoutColumns(daySlots.map((s) => ({ id: s.id, start: s.start, end: s.end })));
            const realIdx = days.indexOf(day);
            return (
              <div key={day} ref={(el) => { dayRefs.current[realIdx] = el; }} data-day={day} className="relative shrink-0 border-r border-slate-100 last:border-r-0" style={{ height: GRID_H + HEADER_H, width: view === "week" ? "var(--col-w)" : "100%" }}>
                <div className="sticky top-0 z-10 flex flex-col justify-center border-b border-slate-100 bg-white/95 px-2 backdrop-blur" style={{ height: HEADER_H }}>
                  <div className="text-xs font-semibold text-slate-700">{dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} <span className="text-slate-400">{dt.getUTCDate()}</span></div>
                  {dayStays.length > 0 && <div className="truncate text-[10px] text-indigo-500" title={dayStays.map((s) => s.name).join(", ")}>🛏 {dayStays[0].name}</div>}
                </div>

                <div className="absolute inset-x-0" style={{ top: HEADER_H, height: GRID_H }}
                  onClick={(e) => { if (canEdit && e.target === e.currentTarget) addAt(day, DAY_START_H * 60 + e.nativeEvent.offsetY / PX_PER_MIN); }}>
                  {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (<div key={i} className="pointer-events-none absolute inset-x-0 border-t border-slate-50" style={{ top: i * PX_PER_HOUR }} />))}
                  <NowLine day={day} days={days} />
                  {daySlots.map((s) => {
                    const lay = layout.get(s.id)!;
                    const { main, alts } = splitInstances(s.id, instances);
                    if (!main) return null;
                    return <Block key={s.id} slot={s} main={main} alts={alts} entityById={entityById} col={lay.col} colCount={lay.count}
                      canEdit={canEdit} onGestureStart={handlers.onGestureStart} onChange={(next) => handlers.onMoveSlot(s.id, next)} onOpen={() => setDetailSlot(s.id)} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-center text-xs text-slate-400">
        {canEdit ? "Drag to move (across days too) · drag top/bottom edge to resize · tap empty space to add · tap a block to open" : "Read-only — sign in as an editor to make changes. Tap a block for details."}
      </p>

      {detailSlot && slotById.get(detailSlot) && (
        <DetailSheet slot={slotById.get(detailSlot)!} instances={instances} entityById={entityById} canEdit={canEdit} handlers={handlers} onClose={() => setDetailSlot(null)} />
      )}

      <style>{`:root{--col-w:84vw}@media(min-width:768px){:root{--col-w:172px}}`}</style>
    </div>
  );
}

// --- legend / now line -------------------------------------------------------

function Legend() {
  const used = new Set(PREVIEW_ENTITIES.map((e) => e.type));
  const types = ENTITY_TABS.filter((t) => used.has(t.type) || ["food", "museum", "club", "event", "show", "hike", "spa", "accommodation", "travel"].includes(t.type));
  return (
    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
      {types.map((t) => {
        const c = TYPE_COLORS[t.type] ?? TYPE_COLORS.uncategorised;
        return <span key={t.type} className="inline-flex items-center gap-1 text-[11px] text-slate-600"><span className={`h-2.5 w-2.5 rounded-sm ${c.chip}`} /> {t.emoji} {t.label}</span>;
      })}
    </div>
  );
}

function NowLine({ day, days }: { day: string; days: string[] }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const target = days.includes(today) ? today : today < days[0] ? days[0] : days[days.length - 1];
  if (day !== target) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < DAY_START_H * 60 || mins > DAY_END_H * 60) return null;
  const top = (mins - DAY_START_H * 60) * PX_PER_MIN;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top }}>
      <div className="h-px bg-red-500" />
      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
    </div>
  );
}

// --- block -------------------------------------------------------------------

function Block({ slot, main, alts, entityById, col, colCount, canEdit, onGestureStart, onChange, onOpen }: {
  slot: CalSlot; main: CalInstance; alts: CalInstance[]; entityById: Map<string, CalEntity>;
  col: number; colCount: number; canEdit: boolean; onGestureStart?: () => void;
  onChange: (next: { day: string; start: number; end: number }) => void; onOpen: () => void;
}) {
  const entity = entityById.get(main.entityId);
  const type = entity?.type ?? "uncategorised";
  const title = entity?.name ?? slot.label;
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;
  const drag = useRef<{ mode: "move" | "top" | "bottom"; x0: number; y0: number; s0: number; e0: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const [vis, setVis] = useState<{ dx: number; dy: number; start: number } | null>(null);

  const top = (slot.start - DAY_START_H * 60) * PX_PER_MIN;
  const height = Math.max(22, (slot.end - slot.start) * PX_PER_MIN);
  const widthPct = 100 / colCount;
  const planned = main.capacity === "planned";
  const dur = slot.end - slot.start;

  const down = (mode: "move" | "top" | "bottom") => (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, s0: slot.start, e0: slot.end, lastX: e.clientX, lastY: e.clientY, moved: false };
    if (mode === "move") setVis({ dx: 0, dy: 0, start: slot.start });
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    d.lastX = e.clientX; d.lastY = e.clientY;
    if (!d.moved && Math.abs(e.clientY - d.y0) + Math.abs(e.clientX - d.x0) > 4) { d.moved = true; onGestureStart?.(); }
    const dm = snap((e.clientY - d.y0) / PX_PER_MIN);
    if (d.mode === "move") {
      const start = clamp(d.s0 + dm, DAY_START_H * 60, DAY_END_H * 60 - dur);
      setVis({ dx: e.clientX - d.x0, dy: e.clientY - d.y0, start });
    } else if (d.mode === "bottom") {
      onChange({ day: slot.day, start: slot.start, end: clamp(d.e0 + dm, d.s0 + SNAP, DAY_END_H * 60) });
    } else {
      onChange({ day: slot.day, start: clamp(d.s0 + dm, DAY_START_H * 60, d.e0 - SNAP), end: slot.end });
    }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d) { if (!canEdit) onOpen(); return; }
    if (d.mode === "move") {
      if (d.moved) {
        const dm = snap((d.lastY - d.y0) / PX_PER_MIN);
        const start = clamp(d.s0 + dm, DAY_START_H * 60, DAY_END_H * 60 - dur);
        const colEl = (document.elementFromPoint(d.lastX, d.lastY) as HTMLElement | null)?.closest("[data-day]");
        const day = colEl?.getAttribute("data-day") ?? slot.day;
        onChange({ day, start, end: start + dur });
      }
      setVis(null);
    }
    if (!d.moved) onOpen();
  };

  const book = bookingStatusOf(main);
  const bookIcon = book === "done" ? "✅" : book === "needed" ? "📋" : null;
  const done = activityStatusOf(main) === "done";
  const dragging = vis != null;

  return (
    <div className={`group absolute overflow-hidden rounded-lg border-l-4 ${c.bg} ${c.border} ${c.text} shadow-sm ring-1 ring-black/5 ${planned ? "border-dashed" : ""}`}
      style={{ top, height, left: `calc(${col * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, touchAction: "none", cursor: canEdit ? (dragging ? "grabbing" : "grab") : "pointer",
        transform: dragging ? `translate(${vis!.dx}px, ${vis!.dy}px)` : undefined, zIndex: dragging ? 40 : undefined, opacity: dragging ? 0.9 : 1, pointerEvents: dragging ? "none" : undefined }}
      onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onClick={(e) => e.stopPropagation()}>
      {canEdit && <div className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize" onPointerDown={down("top")} onPointerMove={move} onPointerUp={up} />}
      {dragging && <div className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">{fmt(vis!.start)}</div>}
      <div className="px-1.5 py-1">
        <div className="flex items-start gap-1">
          <span className="text-[11px] leading-tight">{emojiOf(type)}</span>
          <div className="min-w-0 flex-1">
            <div className={`truncate text-[11px] font-semibold leading-tight ${done ? "line-through opacity-60" : ""}`}>{title}</div>
            {height > 30 && <div className="truncate text-[10px] opacity-70">{fmt(slot.start)}{height > 44 ? `–${fmt(slot.end)}` : ""}{entity?.parent ? ` · @${entity.parent}` : entity?.area ? ` · ${entity.area}` : ""}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {done && <span className="text-[10px]" title="Done">✓</span>}
            {bookIcon && <span className="text-[10px]" title={book === "done" ? "Booked" : "Needs booking"}>{bookIcon}</span>}
            {planned && <span className="rounded bg-black/10 px-1 text-[8px] font-bold uppercase">plan</span>}
            {alts.length > 0 && <span className={`rounded-full ${c.chip} px-1 text-[9px] font-bold text-white`}>+{alts.length}</span>}
          </div>
        </div>
        {height > 58 && main.note && <div className="mt-0.5 line-clamp-1 text-[10px] opacity-60">{main.note}</div>}
        {height > 76 && alts.length > 0 && (
          <div className="mt-0.5 space-y-px">
            {alts.slice(0, 2).map((a) => <div key={a.entityId} className="truncate text-[9px] opacity-55">▹ {entityById.get(a.entityId)?.name ?? a.entityId}</div>)}
            {alts.length > 2 && <div className="text-[9px] opacity-45">+{alts.length - 2} more</div>}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize" onPointerDown={down("bottom")} onPointerMove={move} onPointerUp={up}>
          <div className="mx-auto mt-0.5 h-0.5 w-5 rounded-full bg-current opacity-0 group-hover:opacity-30" />
        </div>
      )}
    </div>
  );
}

// --- detail sheet ------------------------------------------------------------

function DetailSheet({ slot, instances, entityById, canEdit, handlers, onClose }: {
  slot: CalSlot; instances: CalInstance[]; entityById: Map<string, CalEntity>; canEdit: boolean; handlers: CalHandlers; onClose: () => void;
}) {
  const { main, alts } = splitInstances(slot.id, instances);
  const ent = main ? entityById.get(main.entityId) : undefined;
  const adhoc = !ent; // logistics / freshly-added item with no DB entity
  const isNew = slot.id.startsWith("new-");
  const [note, setNote] = useState(main?.note ?? "");
  const [label, setLabel] = useState(slot.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [editPlace, setEditPlace] = useState(false);
  if (!main) return null;
  const type = ent?.type ?? "uncategorised";
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;
  const title = ent?.name ?? label;
  const mapQuery = ent?.address || `${ent?.name ?? label}${ent?.area ? " " + ent.area : ""}`;

  const save = () => {
    if (canEdit) {
      if (note !== (main.note ?? "")) handlers.onUpdateInstance(slot.id, main.entityId, { note });
      if (adhoc && label !== slot.label) handlers.onRenameSlot(slot.id, label);
    }
    onClose();
  };
  const cancel = () => {
    if (isNew && canEdit) handlers.onDeleteSlot(slot.id, instances.filter((i) => i.slotId === slot.id).map((i) => `${i.slotId}__${i.entityId}`));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={cancel}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className={`mb-1 inline-flex items-center gap-1 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-[11px] font-medium`}>{emojiOf(type)} {type}</span>
            {adhoc && canEdit ? (
              <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={isNew} placeholder="Activity name…" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-lg font-semibold outline-none focus:border-slate-400" />
            ) : <h2 className="text-lg font-semibold leading-snug">{title}</h2>}
            <div className="mt-0.5 text-xs text-slate-500">{fmt(slot.start)} – {fmt(slot.end)}{ent?.parent ? ` · @${ent.parent}` : ent?.area ? ` · ${ent.area}` : ""}</div>
          </div>
          <button onClick={cancel} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {!adhoc && (
          <div className="space-y-1 text-sm">
            <a href={mapsSearch(mapQuery)} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-slate-600 hover:text-ink"><span>📍</span><span className="underline decoration-slate-300">{ent?.address || `Find "${ent?.name}" on Google Maps`}</span></a>
            {ent?.hours && <div className="flex items-start gap-2 text-slate-600"><span>🕑</span><span>{ent.hours}</span></div>}
            {ent?.website && <a href={ent.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:underline"><span>🔗</span><span className="truncate">{ent.website.replace(/^https?:\/\//, "")}</span></a>}
            {ent?.instagram && <a href={igUrl(ent.instagram)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-pink-600 hover:underline"><span>📸</span><span>{ent.instagram}</span></a>}
            {ent?.phone && <a href={`tel:${ent.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-slate-600 hover:underline"><span>📞</span><span>{ent.phone}</span></a>}
          </div>
        )}

        {canEdit && handlers.onSaveEntity && (
          <div className="mt-3">
            <button onClick={() => setEditPlace((o) => !o)} className={`text-xs font-medium ${adhoc ? "text-indigo-600" : "text-slate-500"} hover:underline`}>
              {adhoc ? "🏷 Categorise & add details" : "✏️ Edit place details"} {editPlace ? "▲" : "▼"}
            </button>
            {editPlace && (
              <PlaceEditor entityId={main.entityId} ent={ent} fallbackName={adhoc ? label : main.entityId}
                onSave={(patch) => { handlers.onSaveEntity!(main.entityId, patch); setEditPlace(false); }}
                onCancel={() => setEditPlace(false)} />
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <Segmented
              value={activityStatusOf(main)} disabled={!canEdit}
              onChange={(v) => handlers.onUpdateInstance(slot.id, main.entityId, { status: v as ActivityStatus })}
              options={[{ value: "planned", label: "Planned" }, { value: "scheduled", label: "Scheduled" }, { value: "done", label: "✓ Done" }]}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Booking</p>
            <Segmented
              value={bookingStatusOf(main)} disabled={!canEdit}
              onChange={(v) => handlers.onUpdateInstance(slot.id, main.entityId, { bookingStatus: v as BookingStatus })}
              options={[{ value: "walkin", label: "Walk-in" }, { value: "needed", label: "📋 Needed" }, { value: "done", label: "✅ Booked" }]}
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note</p>
          {canEdit ? (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Notes for this visit…" />
          ) : <p className="whitespace-pre-line text-sm text-slate-700">{main.note || <span className="text-slate-400">No note.</span>}</p>}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Competing options for this slot</p>
          <ul className="space-y-1.5">
            {ent && <OptionRow ent={ent} isMain />}
            {!ent && <li className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium">{title} <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span></li>}
            {alts.map((a) => { const e = entityById.get(a.entityId); return e ? <OptionRow key={a.entityId} ent={e} canEdit={canEdit} onMakeMain={() => handlers.onMakeMain(slot.id, a.entityId)} /> : null; })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Only the main option exports to Google Calendar.{canEdit ? " “Make main” swaps it in." : ""}</p>
        </div>

        {ent && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <a href={`/database?open=${encodeURIComponent(ent.id)}`} className="text-sm font-medium text-indigo-600 hover:underline">{emojiOf(type)} Edit {ent.name} in Database →</a>
            <div className="mt-2">
              <button onClick={() => setCommentOpen((o) => !o)} className="text-sm text-slate-500 hover:text-slate-700">💬 Comments {commentOpen ? "▲" : "▼"} <span className="text-slate-400">· 📷 photos</span></button>
              {commentOpen && <p className="mt-2 text-[11px] text-slate-400">Comments + photos arrive in a later pass.</p>}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="mt-5 flex items-center justify-between gap-2">
            {!isNew ? <button onClick={() => { handlers.onDeleteSlot(slot.id, instances.filter((i) => i.slotId === slot.id).map((i) => `${i.slotId}__${i.entityId}`)); onClose(); }} className="text-xs font-medium text-rose-500 hover:underline">Delete slot</button> : <span />}
            <div className="flex gap-2">
              <button onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={save} className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-white">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionRow({ ent, isMain, canEdit, onMakeMain }: { ent: CalEntity; isMain?: boolean; canEdit?: boolean; onMakeMain?: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
      <span>{emojiOf(ent.type)}</span>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{ent.name}</div>{ent.area && <div className="text-[11px] text-slate-400">{ent.parent ? `@${ent.parent}` : ent.area}</div>}</div>
      {isMain ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span>
        : canEdit ? <button onClick={onMakeMain} className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">make main ⇄</button>
        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">Plan B</span>}
    </li>
  );
}

function Segmented({ value, options, disabled, onChange }: {
  value: string; options: { value: string; label: string }[]; disabled?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-medium">
      {options.map((o) => (
        <button key={o.value} disabled={disabled} onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-1.5 py-1 ${value === o.value ? "bg-ink text-white shadow-sm" : "text-slate-500"} ${disabled ? "cursor-default opacity-70" : "hover:text-slate-700"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Types offered when categorising a place from the itinerary (real, place-like
// kinds first; logistics buckets kept available at the end).
const PLACE_TYPE_OPTIONS = ENTITY_TABS.filter((t) => t.type !== "uncategorised");

function PlaceEditor({ entityId, ent, fallbackName, onSave, onCancel }: {
  entityId: string; ent?: CalEntity; fallbackName: string;
  onSave: (patch: EntityPatch) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(ent?.name ?? (fallbackName.startsWith("adhoc:") ? "" : fallbackName));
  const [type, setType] = useState<EntityType>(ent?.type && ent.type !== "uncategorised" ? ent.type : "food");
  const [area, setArea] = useState(ent?.area ?? "");
  const [address, setAddress] = useState(ent?.address ?? "");
  const [website, setWebsite] = useState(ent?.website ?? "");
  const [instagram, setInstagram] = useState(ent?.instagram ?? "");
  const [hours, setHours] = useState(ent?.hours ?? "");
  const inp = "w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-400";

  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), type, area: area.trim() || undefined, address: address.trim() || undefined,
      website: website.trim() || undefined, instagram: instagram.trim() || undefined, hours: hours.trim() || undefined });
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Place name" className={inp} autoFocus />
        <select value={type} onChange={(e) => setType(e.target.value as EntityType)} className={inp}>
          {PLACE_TYPE_OPTIONS.map((t) => <option key={t.type} value={t.type}>{t.emoji} {t.label}</option>)}
        </select>
      </div>
      <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area / neighbourhood" className={inp} />
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className={inp} />
        <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" className={inp} />
      </div>
      <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" className={inp} />
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white">Cancel</button>
        <button onClick={save} disabled={!name.trim()} className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Save place</button>
      </div>
      <p className="text-[10px] text-slate-400">Saved to the Database — also updates everywhere this place appears.</p>
    </div>
  );
}

// --- day map -----------------------------------------------------------------

function DayMap({ day, slots, instances, entityById }: { day: string; slots: CalSlot[]; instances: CalInstance[]; entityById: Map<string, CalEntity> }) {
  const stops = slots
    .map((s) => ({ s, main: splitInstances(s.id, instances).main }))
    .filter((x) => x.main)
    .sort((a, b) => a.s.start - b.s.start)
    .map((x) => ({ s: x.s, main: x.main!, ent: entityById.get(x.main!.entityId) }));
  const labelOf = (x: { s: CalSlot; ent?: CalEntity }) => x.ent?.name ?? x.s.label;
  const queryOf = (x: { s: CalSlot; ent?: CalEntity }) => x.ent?.address || `${labelOf(x)} ${x.ent?.area ?? ""}`;
  const routeUrl = `https://www.google.com/maps/dir/${stops.map(queryOf).map(encodeURIComponent).join("/")}`;
  const dt = new Date(day + "T12:00:00");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ minHeight: "60vh" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">{dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })} — {stops.length} stops</h2>
        {stops.length > 1 && <a href={routeUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white">Open route in Google Maps →</a>}
      </div>
      <ol className="space-y-2">
        {stops.map((x, i) => { const c = TYPE_COLORS[x.ent?.type ?? "uncategorised"] ?? TYPE_COLORS.uncategorised; return (
          <li key={x.s.id} className="flex items-center gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${c.chip} text-xs font-bold text-white`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <a href={mapsSearch(queryOf(x))} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-700 hover:underline">{emojiOf(x.ent?.type ?? "uncategorised")} {labelOf(x)}</a>
              <div className="truncate text-xs text-slate-400">{fmt(x.s.start)} · {x.ent?.address || x.ent?.area || ""}</div>
            </div>
          </li>); })}
        {stops.length === 0 && <li className="text-sm text-slate-400">No stops this day.</li>}
      </ol>
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

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

// =============================================================================
// /preview wrapper — local state + undo (the design sandbox, sample data)
// =============================================================================

const PV_DAYS = Array.from(new Set(PREVIEW_SLOTS.map((s) => s.day))).sort();
const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

export function ItineraryGrid() {
  const [entities, setEntities] = useState<CalEntity[]>(() => PREVIEW_ENTITIES.map((e) => ({ ...e })));
  const [slots, setSlots] = useState<CalSlot[]>(() => PREVIEW_SLOTS.map((s) => ({ id: s.id, day: s.day, start: toMin(s.start), end: s.end ? toMin(s.end) : toMin(s.start) + 90, label: s.label })));
  const [instances, setInstances] = useState<CalInstance[]>(() => PREVIEW_INSTANCES.map((i) => ({ ...i })));
  const [history, setHistory] = useState<{ entities: CalEntity[]; slots: CalSlot[]; instances: CalInstance[] }[]>([]);
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const record = () => setHistory((h) => [...h.slice(-40), { entities, slots, instances }]);
  const undo = () => setHistory((h) => { if (!h.length) return h; const s = h[h.length - 1]; setEntities(s.entities); setSlots(s.slots); setInstances(s.instances); return h.slice(0, -1); });

  const handlers: CalHandlers = {
    onGestureStart: record,
    onMoveSlot: (id, next) => setSlots((p) => p.map((s) => s.id === id ? { ...s, ...next } : s)),
    onAddSlot: (slot, inst) => { record(); setSlots((p) => [...p, slot]); setInstances((p) => [...p, inst]); },
    onDeleteSlot: (id) => { record(); setSlots((p) => p.filter((s) => s.id !== id)); setInstances((p) => p.filter((i) => i.slotId !== id)); },
    onMakeMain: (slotId, entityId) => { record(); setInstances((p) => p.map((i) => i.slotId !== slotId ? i : i.entityId === entityId ? { ...i, capacity: "confirmed" } : i.capacity !== "planB" ? { ...i, capacity: "planB" } : i)); },
    onUpdateInstance: (slotId, entityId, patch) => { record(); setInstances((p) => p.map((i) => i.slotId === slotId && i.entityId === entityId ? { ...i, ...patch } : i)); },
    onRenameSlot: (slotId, label) => { record(); setSlots((p) => p.map((s) => s.id === slotId ? { ...s, label } : s)); setEntities((p) => p.some((e) => e.id === `adhoc:${slotId}`) ? p : [...p, { id: `adhoc:${slotId}`, name: label, type: "uncategorised" }]); },
    onSaveEntity: (entityId, patch) => { record(); setEntities((p) => p.some((e) => e.id === entityId) ? p.map((e) => e.id === entityId ? { ...e, ...patch } : e) : [...p, { id: entityId, ...patch }]); },
  };

  return (
    <ItineraryCalendar calName="NY Trip — Gooshie" days={PV_DAYS} entityById={entityById} slots={slots} instances={instances}
      stays={PREVIEW_STAYS} canEdit handlers={handlers} onUndo={undo} canUndo={history.length > 0} />
  );
}
