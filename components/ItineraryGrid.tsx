"use client";

// Presentational itinerary calendar (Google-Calendar-style day/week/map view)
// plus the /preview local-state wrapper. The same <ItineraryCalendar> is reused
// by components/ItineraryBoard.tsx backed by Firestore. All data + mutations
// come in via props so this component holds only ephemeral UI state (view,
// selected day, open sheet, drag visuals).

import { useEffect, useMemo, useRef, useState } from "react";
import { ENTITY_TABS, type EntityType } from "@/lib/entities";
import { buildTripIcs, downloadIcs, type IcsStay } from "@/lib/ics-export";
import { requestEnrichment } from "@/lib/enrich";
import { activityStatusOf, bookingStatusOf, setInstanceRating, type ActivityStatus, type BookingStatus, type Capacity } from "@/lib/itinerary";
import { ACTIVITY_PILL, BOOKING_PILL } from "@/lib/statusStyles";
import { useAuth } from "./AuthProvider";
import { useBackClose } from "@/lib/useBackClose";
import { Comments } from "./Comments";
import { PhotoGallery } from "./PhotoGallery";
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
const LONG_PRESS_MS = 350;
// Delay before showing the "lifting" grab affordance, so a quick tap (which
// just opens the popup) doesn't flash a grabbed/dragged look.
const LIFT_HINT_MS = 160;

export type CalEntity = {
  id: string; name: string; type: EntityType;
  area?: string; parent?: string; address?: string; website?: string; instagram?: string; phone?: string; hours?: string;
  notes?: string;
  /** The entity's favourited photos (shown in the Database). */
  photos?: string[];
};
export type CalSlot = { id: string; day: string; start: number; end: number; label: string };
export type CalInstance = { slotId: string; entityId: string; capacity: Capacity; note?: string; status?: ActivityStatus; bookingStatus?: BookingStatus; needsBooking?: boolean; booked?: boolean; photos?: string[]; ratings?: Record<string, { score: number; name: string }> };

/** Editable place fields surfaced inside the itinerary popup (writes to the DB). */
export type EntityPatch = {
  name: string; type: EntityType;
  area?: string; address?: string; website?: string; instagram?: string; hours?: string; notes?: string;
  parentId?: string;
};

export type CalHandlers = {
  onMoveSlot: (slotId: string, next: { day: string; start: number; end: number }) => void;
  onAddSlot: (slot: CalSlot, inst: CalInstance) => void;
  onDeleteSlot: (slotId: string, instanceIds: string[]) => void;
  onMakeMain: (slotId: string, entityId: string) => void;
  onAddAlt: (slotId: string, entityId: string) => void;
  onUpdateInstance: (slotId: string, entityId: string, patch: Partial<CalInstance>) => void;
  /** Promote/demote one of a visit's photos to the entity (its Database gallery). */
  onToggleEntityPhoto?: (entityId: string, url: string, next: boolean) => void;
  onRenameSlot: (slotId: string, label: string) => void;
  onReplaceMain?: (slotId: string, newEntityId: string) => void;
  onSaveEntity?: (entityId: string, patch: EntityPatch) => void;
  onSaveEntityNote?: (entityId: string, note: string) => void;
  onSaveStay?: (stay: IcsStay) => void;
  onDeleteStay?: (from: string) => void;
  onGestureStart?: () => void;
};

const emojiOf = (type: string) => ENTITY_TABS.find((t) => t.type === type || (type === "party" && t.type === "club"))?.emoji ?? "•";
function fmt(min: number): string {
  let h = Math.floor(min / 60); const m = min % 60;
  const am = h < 12 || h >= 24 ? "am" : "pm"; h = h % 24;
  let hh = h % 12; if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${am}` : `${hh}:${String(m).padStart(2, "0")}${am}`;
}
// Short day label, e.g. "Thu, 05/06" (DD/MM).
function shortDay(iso: string): string {
  const dt = new Date(iso + "T12:00:00");
  const wd = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${wd}, ${dd}/${mm}`;
}
// Cancel the next click event (capture phase) to kill the ghost/synthesized
// click that browsers fire after a touch — it would otherwise activate
// whatever element sits under the finger in a popup we just opened.
function swallowNextClick() {
  if (typeof window === "undefined") return;
  const handler = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
    window.removeEventListener("click", handler, true);
  };
  window.addEventListener("click", handler, true);
  setTimeout(() => window.removeEventListener("click", handler, true), 500);
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
  calName, tripId, days, entityById, slots, instances, stays, canEdit, handlers, onUndo, canUndo,
}: {
  calName: string;
  tripId?: string;
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
  const [stayEditDay, setStayEditDay] = useState<string | null>(null);
  // Default to day view on mobile, week view on desktop.
  const [view, setView] = useState<"week" | "day">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "day" : "week"
  );
  const [dayIdx, setDayIdx] = useState(() => {
    const idx = days.indexOf(localToday());
    return idx >= 0 ? idx : 0;
  });
  const newCounter = useRef(0);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Ghost slot state: preview a new 1-hour slot while the user drags on empty space.
  const [ghostSlot, setGhostSlot] = useState<{ day: string; startMin: number } | null>(null);
  const ghostRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pending: { pointerId: number; clientX: number; clientY: number; startMin: number; day: string; el: HTMLElement } | null;
    drag: { pointerId: number; clientY0: number; startMin0: number; day: string } | null;
  }>({ timer: null, pending: null, drag: null });

  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const visibleDays = view === "week" ? days : [days[Math.min(dayIdx, days.length - 1)]];
  const slotsOn = (day: string) => slots.filter((s) => s.day === day);

  const goPrev = () => setDayIdx((i) => Math.max(0, i - 1));
  const goNext = () => setDayIdx((i) => Math.min(days.length - 1, i + 1));

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
    setJustCreatedId(id);
  };

  const onGridPointerDown = (day: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startMin = DAY_START_H * 60 + (e.clientY - rect.top) / PX_PER_MIN;
    const snapped = clamp(snap(startMin), DAY_START_H * 60, DAY_END_H * 60 - 60);
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const clientX = e.clientX;
    const clientY = e.clientY;
    ghostRef.current.pending = { pointerId, clientX, clientY, startMin: snapped, day, el };
    ghostRef.current.timer = setTimeout(() => {
      const p = ghostRef.current.pending;
      if (!p) return;
      el.setPointerCapture(pointerId);
      ghostRef.current.pending = null;
      ghostRef.current.drag = { pointerId, clientY0: p.clientY, startMin0: p.startMin, day };
      setGhostSlot({ day, startMin: p.startMin });
    }, LONG_PRESS_MS);
  };

  const onGridPointerMove = (day: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (ghostRef.current.pending) {
      const { clientX, clientY } = ghostRef.current.pending;
      if (Math.abs(e.clientX - clientX) + Math.abs(e.clientY - clientY) > 8) {
        if (ghostRef.current.timer) { clearTimeout(ghostRef.current.timer); ghostRef.current.timer = null; }
        ghostRef.current.pending = null;
      }
      return;
    }
    const { drag } = ghostRef.current;
    if (!drag || drag.day !== day) return;
    const dm = snap((e.clientY - drag.clientY0) / PX_PER_MIN);
    const newStart = clamp(drag.startMin0 + dm, DAY_START_H * 60, DAY_END_H * 60 - 60);
    setGhostSlot({ day, startMin: newStart });
  };

  const onGridPointerUp = (day: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (ghostRef.current.timer) { clearTimeout(ghostRef.current.timer); ghostRef.current.timer = null; }
    ghostRef.current.pending = null;
    const { drag } = ghostRef.current;
    if (drag) {
      ghostRef.current.drag = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      const startMin = ghostSlot?.startMin ?? drag.startMin0;
      setGhostSlot(null);
      addAt(day, startMin);
      swallowNextClick();
      return;
    }
    // Desktop: quick click to add at pointer position
    if (e.target === e.currentTarget && e.pointerType !== "touch") {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      addAt(day, DAY_START_H * 60 + (e.clientY - rect.top) / PX_PER_MIN);
    }
  };

  const onGridPointerCancel = () => {
    if (ghostRef.current.timer) { clearTimeout(ghostRef.current.timer); ghostRef.current.timer = null; }
    ghostRef.current.pending = null;
    ghostRef.current.drag = null;
    setGhostSlot(null);
  };

  // Swipe left/right in day view to navigate between days.
  const onGridTouchStart = (e: React.TouchEvent) => {
    if (view !== "day") return;
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onGridTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStart.current || view !== "day") return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = e.changedTouches[0].clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      dx < 0 ? goNext() : goPrev();
    }
  };

  return (
    <div className="select-none">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
            {(["day", "week"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 capitalize ${view === v ? "bg-ink text-white" : "text-slate-500"}`}>{v}</button>
            ))}
          </div>
          {onUndo && (
            <button onClick={onUndo} disabled={!canUndo} title="Undo"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${canUndo ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-slate-100 bg-slate-50 text-slate-300"}`}>↶ Undo</button>
          )}
        </div>

        {/* Day navigator — day view only */}
        {view === "day" && (
          <div className="flex items-center gap-1">
            <button onClick={goPrev} disabled={dayIdx === 0} className="rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30">‹</button>
            <span className="min-w-[5.5rem] text-center text-sm font-semibold text-slate-700">
              {shortDay(visibleDays[0])}
            </span>
            <button onClick={goNext} disabled={dayIdx === days.length - 1} className="rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30">›</button>
          </div>
        )}

        {/* Day jump strip — week view only */}
        {view === "week" && (
          <div className="flex gap-1 overflow-x-auto">
            {days.map((d, i) => { const dt = new Date(d + "T12:00:00"); return (
              <button key={d} onClick={() => dayRefs.current[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })} className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} <span className="text-slate-400">{dt.getUTCDate()}</span>
              </button>); })}
          </div>
        )}
      </div>

      <div
          className="relative flex overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
          style={{ height: "72vh" }}
          onTouchStart={onGridTouchStart}
          onTouchEnd={onGridTouchEnd}
        >
          {/* Time ruler */}
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
            const wide = view === "day";
            return (
              <div key={day} ref={(el) => { dayRefs.current[realIdx] = el; }} data-day={day} className={`relative border-r border-slate-100 last:border-r-0 ${wide ? "min-w-0 flex-1" : "shrink-0"}`} style={{ height: GRID_H + HEADER_H, width: wide ? undefined : "var(--col-w)" }}>
                {/* Day header */}
                <div className="sticky top-0 z-10 flex flex-col justify-center border-b border-slate-100 bg-white/95 px-2 backdrop-blur" style={{ height: HEADER_H }}>
                  <div className={`font-semibold text-slate-700 ${wide ? "text-sm" : "text-xs"}`}>
                    {wide
                      ? shortDay(day)
                      : `${dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${dt.getUTCDate()}`}
                  </div>
                  {dayStays.length > 0 ? (
                    <button onClick={() => canEdit && setStayEditDay(day)} className={`truncate text-left text-[10px] text-indigo-500 ${canEdit ? "hover:text-indigo-700" : ""}`} title={dayStays.map((s) => s.name).join(", ")}>
                      🛏 {dayStays[0].name}
                    </button>
                  ) : canEdit ? (
                    <button onClick={() => setStayEditDay(day)} className="text-left text-[10px] text-slate-300 hover:text-slate-500">+ stay</button>
                  ) : null}
                </div>

                <div className="absolute inset-x-0" style={{ top: HEADER_H, height: GRID_H }}
                  onPointerDown={onGridPointerDown(day)}
                  onPointerMove={onGridPointerMove(day)}
                  onPointerUp={onGridPointerUp(day)}
                  onPointerCancel={onGridPointerCancel}>
                  {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (<div key={i} className="pointer-events-none absolute inset-x-0 border-t border-slate-50" style={{ top: i * PX_PER_HOUR }} />))}
                  <NowLine day={day} days={days} />
                  {ghostSlot?.day === day && (
                    <div className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-slate-400 bg-slate-200/50"
                      style={{ top: (ghostSlot.startMin - DAY_START_H * 60) * PX_PER_MIN, height: 60 * PX_PER_MIN }}>
                      <div className="flex h-full flex-col items-center justify-center gap-0.5">
                        <span className="text-[11px] font-semibold text-slate-500">{fmt(ghostSlot.startMin)}</span>
                        <span className="text-[10px] text-slate-400">–{fmt(ghostSlot.startMin + 60)}</span>
                      </div>
                    </div>
                  )}
                  {daySlots.map((s) => {
                    const lay = layout.get(s.id)!;
                    const { main, alts } = splitInstances(s.id, instances);
                    if (!main) return null;
                    return <Block key={s.id} slot={s} main={main} alts={alts} entityById={entityById}
                      col={lay.col} colCount={lay.count} wide={wide}
                      canEdit={canEdit} onGestureStart={handlers.onGestureStart}
                      onChange={(next) => handlers.onMoveSlot(s.id, next)} onOpen={() => setDetailSlot(s.id)} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>

      <p className="mt-2 text-center text-xs text-slate-400">
        {canEdit
          ? "Tap to open · long-press block to move · drag top/bottom edge to resize · long-press empty space to place new slot"
          : "Read-only — sign in as an editor to make changes. Tap a block for details."}
      </p>

      {detailSlot && slotById.get(detailSlot) && (
        <DetailSheet slot={slotById.get(detailSlot)!} instances={instances} entityById={entityById} canEdit={canEdit} handlers={handlers} isNew={justCreatedId === detailSlot} tripId={tripId} onClose={() => { setDetailSlot(null); setJustCreatedId(null); }} />
      )}

      {stayEditDay && (
        <StaySheet
          day={stayEditDay}
          days={days}
          current={stays.find((s) => stayEditDay >= s.from && stayEditDay < s.to)}
          onSave={(stay) => { handlers.onSaveStay?.(stay); setStayEditDay(null); }}
          onDelete={(from) => { handlers.onDeleteStay?.(from); setStayEditDay(null); }}
          onClose={() => setStayEditDay(null)}
        />
      )}

      <div className="mt-4">
        <Legend />
      </div>

      <div className="mt-3 flex justify-center">
        <button onClick={exportIcs} title="Export to a .ics calendar file"
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">⤓ Export .ics</button>
      </div>

      <style>{`:root{--col-w:84vw}@media(min-width:768px){:root{--col-w:172px}}`}</style>
    </div>
  );
}

// --- legend / now line -------------------------------------------------------

function Legend() {
  const [open, setOpen] = useState(false);
  const used = new Set(PREVIEW_ENTITIES.map((e) => e.type));
  const types = ENTITY_TABS.filter((t) => used.has(t.type) || ["food", "museum", "club", "event", "show", "hike", "spa", "accommodation", "travel"].includes(t.type));
  return (
    <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-medium text-slate-500"
      >
        <span>Colour legend</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-3 pb-2">
          {types.map((t) => {
            const c = TYPE_COLORS[t.type] ?? TYPE_COLORS.uncategorised;
            return <span key={t.type} className="inline-flex items-center gap-1 text-[11px] text-slate-600"><span className={`h-2.5 w-2.5 rounded-sm ${c.chip}`} /> {t.emoji} {t.label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NowLine({ day, days }: { day: string; days: string[] }) {
  const now = new Date();
  const today = localToday();
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

function Block({ slot, main, alts, entityById, col, colCount, wide, canEdit, onGestureStart, onChange, onOpen }: {
  slot: CalSlot; main: CalInstance; alts: CalInstance[]; entityById: Map<string, CalEntity>;
  col: number; colCount: number; wide: boolean; canEdit: boolean; onGestureStart?: () => void;
  onChange: (next: { day: string; start: number; end: number }) => void; onOpen: () => void;
}) {
  const entity = entityById.get(main.entityId);
  const type = entity?.type ?? "uncategorised";
  const title = entity?.name ?? slot.label;
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;

  type DragState = {
    mode: "move" | "top" | "bottom";
    x0: number; y0: number; s0: number; e0: number;
    lastX: number; lastY: number; moved: boolean;
    currentStart: number;
  };
  const drag = useRef<DragState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTouch = useRef<{ pointerId: number; x0: number; y0: number; target: Element } | null>(null);
  const [dragPhase, setDragPhase] = useState<null | "lifting" | "dragging">(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const timeTagRef = useRef<HTMLDivElement>(null);

  // Non-passive touchmove: prevent page scroll while dragging
  useEffect(() => {
    const el = blockRef.current;
    if (!el || !canEdit) return;
    const onTouchMove = (e: TouchEvent) => { if (drag.current) e.preventDefault(); };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [canEdit]);

  const top = (slot.start - DAY_START_H * 60) * PX_PER_MIN;
  const height = Math.max(22, (slot.end - slot.start) * PX_PER_MIN);
  const widthPct = 100 / colCount;
  const status = activityStatusOf(main);
  const tentative = status === "planned";
  const notDone = status === "notDone";
  const dur = slot.end - slot.start;

  const applyDragTransform = (newStart: number) => {
    const el = blockRef.current; if (!el) return;
    const dy = (newStart - slot.start) * PX_PER_MIN;
    el.style.transform = `translate(0, ${dy}px)`;
    el.style.zIndex = "40";
    el.style.opacity = "0.9";
    if (timeTagRef.current) timeTagRef.current.textContent = fmt(newStart);
  };

  const clearDragTransform = () => {
    const el = blockRef.current; if (!el) return;
    el.style.transform = "";
    el.style.zIndex = "";
    el.style.opacity = "";
  };

  const activateDrag = (mode: DragState["mode"], pointerId: number, x0: number, y0: number, target: Element) => {
    (target as HTMLElement).setPointerCapture(pointerId);
    drag.current = { mode, x0, y0, s0: slot.start, e0: slot.end, lastX: x0, lastY: y0, moved: false, currentStart: slot.start };
    if (mode === "move") {
      setDragPhase("dragging");
    }
    onGestureStart?.();
  };

  const down = (mode: DragState["mode"]) => (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.stopPropagation();

    if (e.pointerType === "touch" && mode === "move") {
      pendingTouch.current = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, target: e.target as Element };
      liftTimer.current = setTimeout(() => setDragPhase("lifting"), LIFT_HINT_MS);
      longPressTimer.current = setTimeout(() => {
        const pt = pendingTouch.current;
        if (!pt) return;
        pendingTouch.current = null;
        activateDrag("move", pt.pointerId, pt.x0, pt.y0, pt.target);
      }, LONG_PRESS_MS);
      return;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, y0: e.clientY, s0: slot.start, e0: slot.end, lastX: e.clientX, lastY: e.clientY, moved: false, currentStart: slot.start };
    if (mode === "move") setDragPhase("dragging");
  };

  const clearPending = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (liftTimer.current) { clearTimeout(liftTimer.current); liftTimer.current = null; }
    pendingTouch.current = null;
    setDragPhase(null);
  };

  const move = (e: React.PointerEvent) => {
    if (pendingTouch.current) {
      const { x0, y0 } = pendingTouch.current;
      if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 8) clearPending();
      return;
    }

    const d = drag.current; if (!d) return;
    d.lastX = e.clientX; d.lastY = e.clientY;
    if (!d.moved && Math.abs(e.clientY - d.y0) + Math.abs(e.clientX - d.x0) > 4) d.moved = true;

    if (d.mode === "move") {
      const newStart = clamp(snap(d.s0 + (e.clientY - d.y0) / PX_PER_MIN), DAY_START_H * 60, DAY_END_H * 60 - dur);
      d.currentStart = newStart;
      applyDragTransform(newStart);
    } else {
      const dm = snap((e.clientY - d.y0) / PX_PER_MIN);
      if (d.mode === "bottom") {
        onChange({ day: slot.day, start: slot.start, end: clamp(d.e0 + dm, d.s0 + SNAP, DAY_END_H * 60) });
      } else {
        onChange({ day: slot.day, start: clamp(d.s0 + dm, DAY_START_H * 60, d.e0 - SNAP), end: slot.end });
      }
    }
  };

  const up = (e: React.PointerEvent) => {
    if (pendingTouch.current) {
      clearPending();
      // Swallow the synthesized click that follows this touch — otherwise it
      // lands on the just-opened popup (e.g. the map link) and navigates away.
      if (e.pointerType === "touch") swallowNextClick();
      onOpen();
      return;
    }

    const d = drag.current; drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d) { if (!canEdit) onOpen(); return; }
    if (d.mode === "move") {
      if (d.moved) {
        const start = d.currentStart;
        const colEl = (document.elementFromPoint(d.lastX, d.lastY) as HTMLElement | null)?.closest("[data-day]");
        const day = colEl?.getAttribute("data-day") ?? slot.day;
        onChange({ day, start, end: start + dur });
      }
      clearDragTransform();
      setDragPhase(null);
    }
    if (!d.moved) onOpen();
  };

  // Browser hijacked the gesture (e.g. page scroll) — reset without opening.
  const cancel = () => {
    clearPending();
    if (drag.current) { drag.current = null; clearDragTransform(); setDragPhase(null); }
  };

  const book = bookingStatusOf(main);
  const bookPill = book !== "walkin" ? BOOKING_PILL[book] : null;
  const done = status === "done";
  const isLifting = dragPhase === "lifting";
  const isDragging = dragPhase === "dragging";
  // Activity status drives the block's weight: Cancelled = hollow spine + flat
  // bg, Done = muted/desaturated, otherwise the full category colour.
  const stateCls = notDone
    ? "border-l-4 border-[#d8a99c] bg-[#f6f2ea] text-[#b0a795]"
    : `border-l-4 ${c.border} ${done ? "bg-fill-soft saturate-50 text-secondary" : `${c.bg} ${c.text}`}`;

  return (
    <div
      ref={blockRef}
      className={`group absolute overflow-hidden rounded-lg ${stateCls} shadow-sm ring-1 ring-black/5 ${tentative ? "border-dashed" : ""}`}
      style={{
        top, height,
        left: `calc(${col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        touchAction: isDragging ? "none" : "auto",
        cursor: canEdit ? (isDragging ? "grabbing" : "grab") : "pointer",
        transform: isLifting ? "scale(1.04)" : undefined,
        boxShadow: isLifting ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
        zIndex: isLifting ? 40 : undefined,
      }}
      onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onClick={(e) => e.stopPropagation()}
    >
      {canEdit && (
        <div className="absolute inset-x-0 top-0 z-10 flex h-5 cursor-ns-resize items-start justify-center" style={{ touchAction: "none" }} onPointerDown={down("top")} onPointerMove={move} onPointerUp={up}>
          <div className="mt-1 h-0.5 w-8 rounded-full bg-current opacity-20 transition-opacity group-hover:opacity-40 sm:opacity-0 sm:group-hover:opacity-30" />
        </div>
      )}
      <div ref={timeTagRef} className={`absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white ${isDragging ? "" : "hidden"}`} />

      <div className="px-1.5 py-1">
        <div className="flex items-start gap-1">
          <span className={`leading-tight ${wide ? "text-sm" : "text-[11px]"}`}>{emojiOf(type)}</span>
          <div className="min-w-0 flex-1">
            <div className={`font-semibold leading-tight ${wide ? "text-sm" : "truncate text-[11px]"} ${notDone ? "line-through opacity-50" : ""}`}>
              {title}
            </div>
            {(wide || height > 30) && (
              <div className={`opacity-70 ${wide ? "text-xs" : "truncate text-[10px]"}`}>
                {fmt(slot.start)}{(wide || height > 44) ? `–${fmt(slot.end)}` : ""}{tentative ? "?" : ""}
                {entity?.parent ? ` · @${entity.parent}` : entity?.area ? ` · ${entity.area}` : ""}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {done && <span className={wide ? "text-xs text-[#9aa386]" : "text-[10px] text-[#9aa386]"} title="Done">✓</span>}
            {bookPill && <span className={`rounded-full px-1.5 py-px text-[8px] font-semibold leading-none ${bookPill.className}`}>{bookPill.short}</span>}
            {alts.length > 0 && <span className={`rounded-full ${c.chip} px-1 text-[9px] font-bold text-white`}>+{alts.length}</span>}
          </div>
        </div>
        {(wide ? main.note : height > 58 && main.note) && (
          <div className={`mt-0.5 opacity-60 ${wide ? "text-xs line-clamp-2" : "line-clamp-1 text-[10px]"}`}>{main.note}</div>
        )}
        {(wide ? alts.length > 0 : height > 76 && alts.length > 0) && (
          <div className="mt-0.5 space-y-px">
            {alts.slice(0, wide ? 3 : 2).map((a) => <div key={a.entityId} className={`opacity-55 ${wide ? "text-[11px]" : "truncate text-[9px]"}`}>▹ {entityById.get(a.entityId)?.name ?? a.entityId}</div>)}
            {alts.length > (wide ? 3 : 2) && <div className={`opacity-45 ${wide ? "text-[11px]" : "text-[9px]"}`}>+{alts.length - (wide ? 3 : 2)} more</div>}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex h-5 cursor-ns-resize items-end justify-center" style={{ touchAction: "none" }} onPointerDown={down("bottom")} onPointerMove={move} onPointerUp={up}>
          <div className="mb-1 h-0.5 w-8 rounded-full bg-current opacity-20 transition-opacity group-hover:opacity-40 sm:opacity-0 sm:group-hover:opacity-30" />
        </div>
      )}
    </div>
  );
}

// --- detail sheet ------------------------------------------------------------

function DetailSheet({ slot, instances, entityById, canEdit, handlers, isNew, tripId, onClose }: {
  slot: CalSlot; instances: CalInstance[]; entityById: Map<string, CalEntity>; canEdit: boolean; handlers: CalHandlers; isNew?: boolean; tripId?: string; onClose: () => void;
}) {
  const { main, alts } = splitInstances(slot.id, instances);
  const ent = main ? entityById.get(main.entityId) : undefined;
  const adhoc = !ent;
  const [note, setNote] = useState(main?.note ?? "");
  const [entityNote, setEntityNote] = useState(ent?.notes ?? "");
  const [entityNoteSaving, setEntityNoteSaving] = useState(false);
  const [label, setLabel] = useState(slot.label);
  const [commentOpen, setCommentOpen] = useState(false);
  const [editPlace, setEditPlace] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [entityNoteOpen, setEntityNoteOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [altsOpen, setAltsOpen] = useState(false);
  const type = ent?.type ?? "uncategorised";
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;
  const title = ent?.name ?? label;
  const mapQuery = ent?.address || `${ent?.name ?? label}${ent?.area ? " " + ent.area : ""}`;

  const save = () => {
    if (main && canEdit) {
      if (note !== (main.note ?? "")) handlers.onUpdateInstance(slot.id, main.entityId, { note });
      if (adhoc && label !== slot.label) handlers.onRenameSlot(slot.id, label);
    }
    onClose();
  };
  const cancel = () => {
    if (isNew && canEdit) handlers.onDeleteSlot(slot.id, instances.filter((i) => i.slotId === slot.id).map((i) => `${i.slotId}__${i.entityId}`));
    onClose();
  };
  useBackClose(true, cancel);
  if (!main) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={cancel}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-[11px] font-medium`}>{emojiOf(type)} {type}</span>
              <CycleBadge value={activityStatusOf(main)} options={STATUS_CYCLE} disabled={!canEdit}
                onChange={(v) => handlers.onUpdateInstance(slot.id, main.entityId, { status: v })} />
              <CycleBadge value={bookingStatusOf(main)} options={BOOKING_CYCLE} disabled={!canEdit}
                onChange={(v) => handlers.onUpdateInstance(slot.id, main.entityId, { bookingStatus: v })} />
            </div>
            {adhoc && canEdit ? (
              <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={isNew} placeholder="Activity name…" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-lg font-semibold outline-none focus:border-slate-400" />
            ) : <h2 className="text-lg font-semibold leading-snug">{title}</h2>}
            <div className="mt-0.5 text-xs text-slate-500">{fmt(slot.start)} – {fmt(slot.end)}{ent?.parent ? ` · @${ent.parent}` : ent?.area ? ` · ${ent.area}` : ""}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && handlers.onSaveEntity && (
              <button onClick={() => setEditPlace((o) => !o)} title={adhoc ? "Categorise & add details" : "Edit place details"}
                className={`rounded-lg border px-2 py-1 text-sm ${editPlace ? "border-slate-400 bg-slate-100" : "border-slate-200"} ${adhoc ? "text-indigo-600" : "text-slate-500"} hover:bg-slate-50`}>
                {adhoc ? "🏷" : "✏️"}
              </button>
            )}
            <button onClick={cancel} className="px-1 text-slate-400 hover:text-slate-600">✕</button>
          </div>
        </div>

        {isNew && adhoc && canEdit && handlers.onReplaceMain && handlers.onSaveEntity && (
          <PrimaryPicker
            entityById={entityById}
            excludeIds={new Set([main.entityId])}
            onPickFromDb={(entityId) => handlers.onReplaceMain!(slot.id, entityId)}
            onCreate={(patch) => { handlers.onSaveEntity!(main.entityId, patch); }}
          />
        )}

        {!adhoc && (
          <div className="space-y-1 text-sm">
            <a href={mapsSearch(mapQuery)} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-slate-600 hover:text-ink"><span>📍</span><span className="underline decoration-slate-300">{ent?.address || `Find "${ent?.name}" on Google Maps`}</span></a>
            {ent?.hours && <div className="flex items-start gap-2 text-slate-600"><span>🕑</span><span>{ent.hours}</span></div>}
            {ent?.website && <a href={ent.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-indigo-600 hover:underline"><span>🔗</span><span className="truncate">{ent.website.replace(/^https?:\/\//, "")}</span></a>}
            {ent?.instagram && <a href={igUrl(ent.instagram)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-pink-600 hover:underline"><span>📸</span><span>{ent.instagram}</span></a>}
            {ent?.phone && <a href={`tel:${ent.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-slate-600 hover:underline"><span>📞</span><span>{ent.phone}</span></a>}
          </div>
        )}

        {canEdit && handlers.onSaveEntity && editPlace && (
          <div className="mt-3">
            <PlaceEditor entityId={main.entityId} ent={ent} fallbackName={adhoc ? label : main.entityId}
              clubs={[...entityById.values()].filter((e) => e.type === "club" && !e.parent)}
              onSave={(patch) => { handlers.onSaveEntity!(main.entityId, patch); setEditPlace(false); }}
              onCancel={() => setEditPlace(false)} />
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* Visit note */}
          <div>
            <button onClick={() => setNoteOpen((o) => !o)} className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
              📝 Visit note {noteOpen ? "▲" : "▼"}
            </button>
            {noteOpen ? (
              canEdit ? (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Notes for this visit…" />
              ) : <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{main.note || <span className="text-slate-400">No note.</span>}</p>
            ) : (
              <p className="truncate text-sm text-slate-600">{main.note || <span className="text-slate-400">{canEdit ? "Add a visit note…" : "No note."}</span>}</p>
            )}
          </div>

          {/* Entity note — collapsed text, tap to edit */}
          {ent && (canEdit || ent.notes) && (
            <div className="border-t border-slate-100 pt-3">
              <button onClick={() => setEntityNoteOpen((o) => !o)} className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                🏷 About this place {entityNoteOpen ? "▲" : "▼"}
              </button>
              {entityNoteOpen ? (
                canEdit ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea value={entityNote} onChange={(e) => setEntityNote(e.target.value)} rows={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="Why it's worth visiting…" />
                    {entityNote !== (ent.notes ?? "") && (
                      <button disabled={entityNoteSaving} onClick={async () => {
                        if (!handlers.onSaveEntityNote) return;
                        setEntityNoteSaving(true);
                        try { await Promise.resolve(handlers.onSaveEntityNote(ent.id, entityNote.trim())); }
                        finally { setEntityNoteSaving(false); }
                      }} className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                        {entityNoteSaving ? "Saving…" : "Save note"}
                      </button>
                    )}
                  </div>
                ) : <p className="mt-1 text-sm text-slate-600">{ent.notes || <span className="text-slate-400">No note.</span>}</p>
              ) : (
                <p className="truncate text-sm text-slate-600">{ent.notes || <span className="text-slate-400">{canEdit ? "Add a note…" : ""}</span>}</p>
              )}
            </div>
          )}
        </div>

        {ent && (
          <div className="mt-4 border-t border-slate-100 pt-3 space-y-3">
            {/* Rating */}
            <div>
              {tripId && <CalRatingWidget tripId={tripId} instanceDocId={`${slot.id}__${main.entityId}`} entityId={main.entityId} ratings={main.ratings} />}
            </div>

            {/* Photos */}
            <div>
              <button onClick={() => setPhotosOpen((o) => !o)} className="text-sm text-slate-500 hover:text-slate-700">
                📷 Photos{main.photos?.length ? ` (${main.photos.length})` : ""} {photosOpen ? "▲" : "▼"}
              </button>
              {photosOpen && (
                <div className="mt-2">
                  <PhotoGallery
                    photos={main.photos ?? []}
                    context="instance"
                    contextId={`${slot.id}__${main.entityId}`}
                    canEdit={canEdit}
                    onPhotosChange={async (photos) => {
                      handlers.onUpdateInstance(slot.id, main.entityId, { photos });
                    }}
                    favourites={ent ? new Set(ent.photos ?? []) : undefined}
                    onToggleFavourite={ent && handlers.onToggleEntityPhoto
                      ? async (url, next) => handlers.onToggleEntityPhoto!(ent.id, url, next)
                      : undefined}
                  />
                  {ent && <p className="mt-1 text-[10px] text-slate-400">★ favourites show on the place in the Database; the rest stay on this visit.</p>}
                </div>
              )}
            </div>

            {/* Comments */}
            <div>
              <button onClick={() => setCommentOpen((o) => !o)} className="text-sm text-slate-500 hover:text-slate-700">
                💬 Comments {commentOpen ? "▲" : "▼"}
              </button>
              {commentOpen && (
                <div className="mt-2">
                  <Comments instanceId={`${slot.id}__${main.entityId}`} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <button onClick={() => setAltsOpen((o) => !o)} className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
            ⚖️ Competing options{alts.length ? ` (${alts.length + 1})` : ""} {altsOpen ? "▲" : "▼"}
          </button>
          {altsOpen && (
            <div className="mt-2">
              <ul className="space-y-1.5">
                {ent && <OptionRow ent={ent} isMain />}
                {!ent && <li className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium">{title} <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span></li>}
                {alts.map((a) => { const e = entityById.get(a.entityId); return <OptionRow key={a.entityId} ent={e} fallbackName={a.entityId.startsWith("adhoc:") ? "New alternative" : a.entityId} canEdit={canEdit} onMakeMain={() => handlers.onMakeMain(slot.id, a.entityId)} />; })}
              </ul>
              {canEdit && (
                <AltAdder
                  entityById={entityById}
                  excludeIds={new Set([main.entityId, ...alts.map((a) => a.entityId)])}
                  onPick={(entityId) => handlers.onAddAlt(slot.id, entityId)}
                  onCreate={(patch) => {
                    const id = `adhoc:alt-${slot.id}-${Date.now()}`;
                    handlers.onAddAlt(slot.id, id);
                    handlers.onSaveEntity?.(id, patch);
                  }}
                  canCreate={!!handlers.onSaveEntity}
                />
              )}
              <p className="mt-2 text-[11px] text-slate-400">Only the main option exports to Google Calendar.{canEdit ? ' "Make main" swaps a Plan B in.' : ""}</p>
            </div>
          )}
        </div>

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

function OptionRow({ ent, fallbackName, isMain, canEdit, onMakeMain }: { ent?: CalEntity; fallbackName?: string; isMain?: boolean; canEdit?: boolean; onMakeMain?: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
      <span>{emojiOf(ent?.type ?? "uncategorised")}</span>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{ent?.name ?? fallbackName}</div>{ent?.area && <div className="text-[11px] text-slate-400">{ent.parent ? `@${ent.parent}` : ent.area}</div>}</div>
      {isMain ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span>
        : canEdit ? <button onClick={onMakeMain} className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">make main ⇄</button>
        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">Plan B</span>}
    </li>
  );
}

function PrimaryPicker({ entityById, excludeIds, onPickFromDb, onCreate }: {
  entityById: Map<string, CalEntity>;
  excludeIds: Set<string>;
  onPickFromDb: (entityId: string) => void;
  onCreate: (patch: EntityPatch) => void;
}) {
  const [mode, setMode] = useState<"db" | "new">("db");
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return [...entityById.values()]
      .filter((e) => !excludeIds.has(e.id) && e.type !== "uncategorised")
      .filter((e) => `${e.name} ${e.area ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [q, entityById, excludeIds]);

  return (
    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
      <div className="mb-2.5 inline-flex rounded-md border border-indigo-200 bg-white p-0.5 text-[11px] font-medium">
        <button onClick={() => setMode("db")} className={`rounded px-2.5 py-0.5 ${mode === "db" ? "bg-indigo-600 text-white" : "text-slate-500"}`}>From database</button>
        <button onClick={() => setMode("new")} className={`rounded px-2.5 py-0.5 ${mode === "new" ? "bg-indigo-600 text-white" : "text-slate-500"}`}>New place</button>
      </div>
      {mode === "db" ? (
        <div>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search by name or area…"
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400" />
          {matches.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {matches.map((e) => (
                <li key={e.id}>
                  <button onClick={() => onPickFromDb(e.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:bg-slate-50">
                    <span>{emojiOf(e.type)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    {e.area && <span className="shrink-0 text-[11px] text-slate-400">{e.parent ? `@${e.parent}` : e.area}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && matches.length === 0 && <p className="mt-1.5 text-[11px] text-slate-500">No match — try "New place" to add it.</p>}
        </div>
      ) : (
        <PlaceEditor entityId="" fallbackName=""
          onSave={(patch) => onCreate(patch)}
          onCancel={() => setMode("db")} />
      )}
    </div>
  );
}

function AltAdder({ entityById, excludeIds, onPick, onCreate, canCreate }: {
  entityById: Map<string, CalEntity>;
  excludeIds: Set<string>;
  onPick: (entityId: string) => void;
  onCreate: (patch: EntityPatch) => void;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return [...entityById.values()]
      .filter((e) => !excludeIds.has(e.id) && e.type !== "uncategorised")
      .filter((e) => `${e.name} ${e.area ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [q, entityById, excludeIds]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50">
        ＋ Add an alternative plan
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      {canCreate && (
        <div className="mb-2 inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
          <button onClick={() => setMode("pick")} className={`rounded px-2 py-0.5 ${mode === "pick" ? "bg-ink text-white" : "text-slate-500"}`}>From Database</button>
          <button onClick={() => setMode("create")} className={`rounded px-2 py-0.5 ${mode === "create" ? "bg-ink text-white" : "text-slate-500"}`}>New place</button>
        </div>
      )}
      {mode === "pick" ? (
        <div>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search the Database…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-400" />
          {matches.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {matches.map((e) => (
                <li key={e.id}>
                  <button onClick={() => { onPick(e.id); setOpen(false); setQ(""); }}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left hover:bg-slate-50">
                    <span>{emojiOf(e.type)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    {e.area && <span className="shrink-0 text-[11px] text-slate-400">{e.parent ? `@${e.parent}` : e.area}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && matches.length === 0 && <p className="mt-1.5 text-[11px] text-slate-400">No match.{canCreate ? ' Use "New place" to add it.' : ""}</p>}
          <button onClick={() => setOpen(false)} className="mt-2 text-[11px] font-medium text-slate-400 hover:underline">Cancel</button>
        </div>
      ) : (
        <PlaceEditor entityId="" fallbackName=""
          onSave={(patch) => { onCreate(patch); setOpen(false); }}
          onCancel={() => setOpen(false)} />
      )}
    </div>
  );
}

const STATUS_CYCLE: { value: ActivityStatus; label: string; className: string }[] = (
  ["planned", "scheduled", "done", "notDone"] as ActivityStatus[]
).map((v) => ({ value: v, label: ACTIVITY_PILL[v].label, className: ACTIVITY_PILL[v].className }));
const BOOKING_CYCLE: { value: BookingStatus; label: string; className: string }[] = (
  ["walkin", "needed", "done"] as BookingStatus[]
).map((v) => ({ value: v, label: BOOKING_PILL[v].label, className: BOOKING_PILL[v].className }));

function CalRatingWidget({ tripId, instanceDocId, entityId, ratings }: {
  tripId: string;
  instanceDocId: string;
  entityId: string;
  ratings?: Record<string, { score: number; name: string }>;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const allRatings = ratings ?? {};
  const email = (user?.email ?? "").toLowerCase();
  const myName = user?.displayName || user?.email || "Me";
  const myRating = email ? allRatings[email] : undefined;
  const others = Object.entries(allRatings).filter(([k]) => k !== email);

  const save = async () => {
    if (!email) return;
    const val = draft.trim();
    const score = val === "" ? null : Math.min(10, Math.max(0, Math.round(parseFloat(val) * 10) / 10));
    if (val !== "" && isNaN(score as number)) { setEditing(false); return; }
    setBusy(true);
    try { await setInstanceRating(tripId, instanceDocId, entityId, email, myName, score); }
    finally { setBusy(false); setEditing(false); }
  };

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rating</p>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex items-center gap-1">
            <input autoFocus type="number" min={0} max={10} step={0.1} value={draft}
              onChange={(e) => setDraft(e.target.value)} disabled={busy} placeholder="0–10"
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500" />
            <button type="submit" disabled={busy} className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-slate-400 hover:text-slate-600">cancel</button>
          </form>
        ) : (
          <button onClick={() => { setDraft(myRating?.score?.toString() ?? ""); setEditing(true); }}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100">
            <span className="text-amber-500">★</span>
            <span>{myRating ? myRating.score.toFixed(1) : "Rate"}</span>
            {myRating && <span className="text-slate-400">(you)</span>}
          </button>
        )}
        {others.map(([, r]) => (
          <span key={r.name} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
            <span className="text-amber-500">★</span> {r.score.toFixed(1)} <span className="font-medium">{r.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CycleBadge<T extends string>({ value, options, disabled, onChange }: {
  value: T; options: { value: T; label: string; className: string }[]; disabled?: boolean; onChange: (v: T) => void;
}) {
  const cur = options.find((o) => o.value === value) ?? options[0];
  const next = () => { const i = options.findIndex((o) => o.value === value); onChange(options[(i + 1) % options.length].value); };
  return (
    <button type="button" disabled={disabled} onClick={next}
      title={disabled ? cur.label : `${cur.label} — tap to change`}
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${cur.className} ${disabled ? "cursor-default" : "hover:opacity-80"}`}>
      {cur.label}
    </button>
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

const PLACE_TYPE_OPTIONS = ENTITY_TABS.filter((t) => t.type !== "uncategorised");

function PlaceEditor({ entityId, ent, fallbackName, clubs, onSave, onCancel }: {
  entityId: string; ent?: CalEntity; fallbackName: string;
  clubs?: CalEntity[];
  onSave: (patch: EntityPatch) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(ent?.name ?? (fallbackName.startsWith("adhoc:") ? "" : fallbackName));
  const [type, setType] = useState<EntityType>(ent?.type && ent.type !== "uncategorised" ? ent.type : "food");
  const [area, setArea] = useState(ent?.area ?? "");
  const [address, setAddress] = useState(ent?.address ?? "");
  const [website, setWebsite] = useState(ent?.website ?? "");
  const [instagram, setInstagram] = useState(ent?.instagram ?? "");
  const [hours, setHours] = useState(ent?.hours ?? "");
  const [notes, setNotes] = useState(""); // populated by auto-fill only; not shown as a field
  const [parentId, setParentId] = useState<string>("");
  const [newVenueName, setNewVenueName] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enriched, setEnriched] = useState(false);
  const inp = "w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-400";

  // AI auto-fill: look up the place by name + type and fill any blank fields.
  // Result is a draft in this form — you still review and click "Save place".
  const autoFill = async () => {
    if (!name.trim()) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const contextParts = [area.trim(), mapsUrl.trim()].filter(Boolean);
      const f = await requestEnrichment({ name: name.trim(), type, context: contextParts.join(" | ") || undefined });
      if (f.area && !area.trim()) setArea(f.area);
      if (f.address && !address.trim()) setAddress(f.address);
      if (f.website && !website.trim()) setWebsite(f.website);
      if (f.instagram && !instagram.trim()) setInstagram(f.instagram);
      if (f.hours && !hours.trim()) setHours(f.hours);
      if (f.notes && !notes.trim()) setNotes(f.notes);
      setEnriched(true);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Auto-fill failed.");
    } finally {
      setEnriching(false);
    }
  };

  // A one-tap way to eyeball whether the auto-filled facts are right.
  const verifyQuery = (address.trim() || `${name.trim()}${area.trim() ? " " + area.trim() : ""}`).trim();

  const resolvedParentId = parentId === "__new__"
    ? (newVenueName.trim() ? `new-venue:${newVenueName.trim()}` : "")
    : parentId;

  const save = () => {
    if (!name.trim()) return;
    if (parentId === "__new__" && !newVenueName.trim()) return;
    onSave({ name: name.trim(), type, area: area.trim() || undefined, address: address.trim() || undefined,
      website: website.trim() || undefined, instagram: instagram.trim() || undefined, hours: hours.trim() || undefined,
      notes: notes.trim() || undefined,
      parentId: (type === "club" && resolvedParentId) ? resolvedParentId : undefined });
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Place name" className={inp} autoFocus />
        <select value={type} onChange={(e) => setType(e.target.value as EntityType)} className={inp}>
          {PLACE_TYPE_OPTIONS.map((t) => <option key={t.type} value={t.type}>{t.emoji} {t.label}</option>)}
        </select>
      </div>
      <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)}
        placeholder="Google Maps link (optional — helps AI find the exact place)"
        className={inp + " text-xs text-slate-500"} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={autoFill} disabled={enriching || !name.trim()}
          title="Look up address, hours, website… with AI. Fills blank fields only; you review before saving."
          className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
          {enriching ? "Looking up…" : "✨ Auto-fill details"}
        </button>
        {enrichError && <span className="text-[11px] text-amber-700">{enrichError}</span>}
      </div>
      {type === "club" && (
        <>
          <select value={parentId} onChange={(e) => { setParentId(e.target.value); setNewVenueName(""); }} className={inp}>
            <option value="">This IS the venue (no parent)</option>
            {(clubs ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.area ? ` — ${c.area}` : ""}</option>)}
            <option value="__new__">＋ New venue…</option>
          </select>
          {parentId === "__new__" && (
            <input value={newVenueName} onChange={(e) => setNewVenueName(e.target.value)} placeholder="Venue name (e.g. Avant Gardner)" className={inp} autoFocus />
          )}
        </>
      )}
      <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area / neighbourhood" className={inp} />
      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className={inp} />
        <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" className={inp} />
      </div>

      <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" className={inp} />

      {enriched && verifyQuery && (
        <a href={mapsSearch(verifyQuery)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline">
          🔍 Double-check on Google Maps ↗
        </a>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white">Cancel</button>
        <button onClick={save} disabled={!name.trim()} className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Save place</button>
      </div>
      <p className="text-[10px] text-slate-400">Saved to the Database — also updates everywhere this place appears.</p>
    </div>
  );
}

// --- stay sheet --------------------------------------------------------------

function StaySheet({ day, days, current, onSave, onDelete, onClose }: {
  day: string; days: string[]; current?: IcsStay;
  onSave: (stay: IcsStay) => void; onDelete: (from: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [from, setFrom] = useState(current?.from ?? day);
  const [to, setTo] = useState(current?.to ?? (days[Math.min(days.indexOf(day) + 1, days.length - 1)]));
  const [address, setAddress] = useState(current?.address ?? "");
  useBackClose(true, onClose);
  const inp = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400";

  const save = () => { if (name.trim() && from && to && to > from) onSave({ name: name.trim(), from, to, address: address.trim() || undefined }); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">🛏 {current ? "Edit stay" : "Add stay"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hotel / Airbnb name" className={inp} autoFocus />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (optional)" className={inp} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-400">Check-in</p>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inp}>
                {days.map((d) => <option key={d} value={d}>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-400">Check-out</p>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={inp}>
                {days.filter((d) => d > from).map((d) => <option key={d} value={d}>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          {current ? (
            <button onClick={() => onDelete(current.from)} className="text-xs font-medium text-rose-500 hover:underline">Remove stay</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={!name.trim() || !to || to <= from} className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">Save</button>
          </div>
        </div>
      </div>
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
  const [pvStays, setPvStays] = useState<IcsStay[]>(() => PREVIEW_STAYS.map((s) => ({ ...s })));
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
    onAddAlt: (slotId, entityId) => { record(); setInstances((p) => p.some((i) => i.slotId === slotId && i.entityId === entityId) ? p : [...p, { slotId, entityId, capacity: "planB", note: "" }]); },
    onUpdateInstance: (slotId, entityId, patch) => { record(); setInstances((p) => p.map((i) => i.slotId === slotId && i.entityId === entityId ? { ...i, ...patch } : i)); },
    onRenameSlot: (slotId, label) => { record(); setSlots((p) => p.map((s) => s.id === slotId ? { ...s, label } : s)); setEntities((p) => p.some((e) => e.id === `adhoc:${slotId}`) ? p : [...p, { id: `adhoc:${slotId}`, name: label, type: "uncategorised" }]); },
    onReplaceMain: (slotId, newEntityId) => { record(); setInstances((p) => p.map((i) => i.slotId === slotId && i.capacity !== "planB" ? { ...i, entityId: newEntityId } : i)); setEntities((p) => p.filter((e) => e.id !== `adhoc:${slotId}`)); },
    onSaveEntity: (entityId, patch) => { record(); setEntities((p) => p.some((e) => e.id === entityId) ? p.map((e) => e.id === entityId ? { ...e, ...patch } : e) : [...p, { id: entityId, ...patch }]); },
    onSaveStay: (stay) => setPvStays((p) => [...p.filter((s) => s.from !== stay.from), stay].sort((a, b) => a.from.localeCompare(b.from))),
    onDeleteStay: (from) => setPvStays((p) => p.filter((s) => s.from !== from)),
  };

  return (
    <ItineraryCalendar calName="NY Trip — Gooshie" days={PV_DAYS} entityById={entityById} slots={slots} instances={instances}
      stays={pvStays} canEdit handlers={handlers} onUndo={undo} canUndo={history.length > 0} />
  );
}
