"use client";

// PROTOTYPE itinerary grid — a Google-Calendar-style day/week view backed by the
// throwaway sample data in lib/preview-data.ts. Times live in local state so you
// can drag blocks to move them and drag the bottom edge to resize. Nothing here
// persists; it exists to settle the look & feel before we wire the real model.

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
  type PreviewInstance,
} from "@/lib/preview-data";

const DAY_START_H = 6; // grid spans 6:00 …
const DAY_END_H = 28; //  … to 4:00 next day
const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;
const SNAP = 15; // minutes
const GRID_H = (DAY_END_H - DAY_START_H) * PX_PER_HOUR;

const entityById = new Map(PREVIEW_ENTITIES.map((e) => [e.id, e]));
const emojiOf = (type: string) => ENTITY_TABS.find((t) => t.type === type)?.emoji ?? "•";

function parseMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fmt(min: number): string {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const am = h < 12 || h >= 24 ? "am" : "pm";
  h = h % 24;
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${am}` : `${hh}:${String(m).padStart(2, "0")}${am}`;
}
const snap = (min: number) => Math.round(min / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Times = { start: number; end: number };

export function ItineraryGrid() {
  // Editable times keyed by slotId.
  const [times, setTimes] = useState<Record<string, Times>>(() => {
    const t: Record<string, Times> = {};
    for (const s of PREVIEW_SLOTS) {
      const start = parseMin(s.start);
      const end = s.end ? parseMin(s.end) : start + 90;
      t[s.id] = { start, end };
    }
    return t;
  });
  const [instances, setInstances] = useState<PreviewInstance[]>(PREVIEW_INSTANCES);
  const [detailSlot, setDetailSlot] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  const slotsByDay = useMemo(() => {
    const m = new Map<string, typeof PREVIEW_SLOTS>();
    for (const d of TRIP_DAYS) m.set(d, []);
    for (const s of PREVIEW_SLOTS) m.get(s.day)?.push(s);
    return m;
  }, []);

  const setSlotTimes = (slotId: string, next: Times) =>
    setTimes((prev) => ({ ...prev, [slotId]: next }));

  const makeMain = (slotId: string, entityId: string) =>
    setInstances((prev) =>
      prev.map((i) => {
        if (i.slotId !== slotId) return i;
        if (i.entityId === entityId) return { ...i, capacity: "confirmed" as Capacity };
        if (i.capacity !== "planB") return { ...i, capacity: "planB" as Capacity };
        return i;
      })
    );

  const scrollToDay = (idx: number) =>
    dayRefs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });

  return (
    <div className="select-none">
      {/* Day quick-nav */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TRIP_DAYS.map((d, i) => {
          const dt = new Date(d + "T12:00:00");
          return (
            <button
              key={d}
              onClick={() => scrollToDay(i)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            >
              {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}{" "}
              <span className="text-slate-400">{dt.getUTCDate()}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={scrollerRef}
        className="relative flex overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ height: "72vh" }}
      >
        {/* Time gutter */}
        <div
          className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-100 bg-white"
          style={{ height: GRID_H }}
        >
          {Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => {
            const hour = DAY_START_H + i;
            return (
              <div
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                style={{ top: i * PX_PER_HOUR }}
              >
                {fmt((hour % 24) * 60)}
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {TRIP_DAYS.map((day, idx) => {
          const dt = new Date(day + "T12:00:00");
          const slots = slotsByDay.get(day) ?? [];
          const stays = PREVIEW_STAYS.filter((s) => day >= s.from && day < s.to);
          const layout = layoutColumns(slots.map((s) => ({ id: s.id, ...times[s.id] })));
          return (
            <div
              key={day}
              ref={(el) => { dayRefs.current[idx] = el; }}
              className="relative shrink-0 snap-start border-r border-slate-100 last:border-r-0"
              style={{ height: GRID_H, width: "var(--col-w)" }}
            >
              {/* Sticky day header */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-1 border-b border-slate-100 bg-white/95 px-2 py-1.5 backdrop-blur">
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    {dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}{" "}
                    <span className="text-slate-400">{dt.getUTCDate()}</span>
                  </div>
                  {stays.length > 0 && (
                    <div className="truncate text-[10px] text-indigo-500" title={stays.map((s) => s.name).join(", ")}>
                      🛏 {stays[0].name}
                    </div>
                  )}
                </div>
              </div>

              {/* Hour gridlines */}
              {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute inset-x-0 border-t border-slate-50"
                  style={{ top: i * PX_PER_HOUR }}
                />
              ))}

              {/* Blocks */}
              {slots.map((s) => {
                const t = times[s.id];
                const lay = layout.get(s.id)!;
                const { main, alts } = splitInstances(s.id, instances);
                if (!main) return null;
                return (
                  <Block
                    key={s.id}
                    slotId={s.id}
                    label={s.label}
                    times={t}
                    main={main}
                    altCount={alts.length}
                    col={lay.col}
                    colCount={lay.count}
                    onChangeTimes={(next) => setSlotTimes(s.id, next)}
                    onOpen={() => setDetailSlot(s.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-center text-xs text-slate-400">
        Drag a block to move it · drag its bottom edge to resize · tap to open · snaps to 15 min
      </p>

      {detailSlot && (
        <DetailSheet
          slotId={detailSlot}
          instances={instances}
          times={times[detailSlot]}
          onMakeMain={(eid) => makeMain(detailSlot, eid)}
          onClose={() => setDetailSlot(null)}
        />
      )}

      {/* Responsive column width: ~86vw (one day) on phones, fixed on desktop. */}
      <style>{`:root{--col-w:86vw}@media(min-width:768px){:root{--col-w:184px}}`}</style>
    </div>
  );
}

// --- one draggable / resizable block ----------------------------------------

function Block({
  slotId,
  label,
  times,
  main,
  altCount,
  col,
  colCount,
  onChangeTimes,
  onOpen,
}: {
  slotId: string;
  label: string;
  times: Times;
  main: PreviewInstance;
  altCount: number;
  col: number;
  colCount: number;
  onChangeTimes: (next: Times) => void;
  onOpen: () => void;
}) {
  const entity = entityById.get(main.entityId);
  const type = entity?.type ?? "uncategorised";
  const c = TYPE_COLORS[type] ?? TYPE_COLORS.uncategorised;
  const drag = useRef<{ mode: "move" | "resize"; y0: number; start0: number; end0: number; moved: boolean } | null>(null);

  const top = (times.start - DAY_START_H * 60) * PX_PER_MIN;
  const height = Math.max(22, (times.end - times.start) * PX_PER_MIN);
  const gap = 2;
  const widthPct = 100 / colCount;
  const planned = main.capacity === "planned";

  const onPointerDown = (mode: "move" | "resize") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, y0: e.clientY, start0: times.start, end0: times.end, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const deltaMin = snap((e.clientY - d.y0) / PX_PER_MIN);
    if (Math.abs(e.clientY - d.y0) > 4) d.moved = true;
    if (d.mode === "move") {
      const dur = d.end0 - d.start0;
      const start = clamp(d.start0 + deltaMin, DAY_START_H * 60, DAY_END_H * 60 - dur);
      onChangeTimes({ start, end: start + dur });
    } else {
      const end = clamp(d.end0 + deltaMin, d.start0 + SNAP, DAY_END_H * 60);
      onChangeTimes({ start: d.start0, end });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onOpen();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      className={`absolute overflow-hidden rounded-lg border-l-4 ${c.bg} ${c.border} ${c.text} px-1.5 py-1 shadow-sm ring-1 ring-black/5 ${planned ? "border-dashed opacity-90" : ""}`}
      style={{
        top,
        height,
        left: `calc(${col * widthPct}% + ${gap}px)`,
        width: `calc(${widthPct}% - ${gap * 2}px)`,
        touchAction: "none",
        cursor: "grab",
      }}
      onPointerDown={onPointerDown("move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-start gap-1">
        <span className="text-[11px] leading-tight">{emojiOf(type)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold leading-tight">{entity?.name ?? label}</div>
          {height > 34 && (
            <div className="truncate text-[10px] opacity-70">
              {fmt(times.start)}{height > 48 ? `–${fmt(times.end)}` : ""}
              {entity?.parent ? ` · @${entity.parent}` : entity?.area ? ` · ${entity.area}` : ""}
            </div>
          )}
        </div>
        {altCount > 0 && (
          <span className={`shrink-0 rounded-full ${c.chip} px-1 text-[9px] font-bold text-white`}>
            +{altCount}
          </span>
        )}
      </div>
      {planned && height > 30 && (
        <span className="absolute right-1 top-1 text-[8px] font-bold uppercase tracking-wide opacity-60">plan</span>
      )}
      {/* resize handle */}
      <div
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
        onPointerDown={onPointerDown("resize")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="mx-auto mt-0.5 h-0.5 w-5 rounded-full bg-current opacity-30" />
      </div>
    </div>
  );
}

// --- detail / Plan-B swap sheet ----------------------------------------------

function DetailSheet({
  slotId,
  instances,
  times,
  onMakeMain,
  onClose,
}: {
  slotId: string;
  instances: PreviewInstance[];
  times: Times;
  onMakeMain: (entityId: string) => void;
  onClose: () => void;
}) {
  const { main, alts } = splitInstances(slotId, instances);
  if (!main) return null;
  const mEnt = entityById.get(main.entityId);
  const mType = mEnt?.type ?? "uncategorised";
  const c = TYPE_COLORS[mType] ?? TYPE_COLORS.uncategorised;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`mb-1 inline-flex items-center gap-1 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-[11px] font-medium`}>
              {emojiOf(mType)} {mType}
            </div>
            <h2 className="text-lg font-semibold leading-snug">{mEnt?.name}</h2>
            <div className="mt-0.5 text-xs text-slate-500">
              {fmt(times.start)} – {fmt(times.end)}
              {mEnt?.parent ? ` · @${mEnt.parent}` : mEnt?.area ? ` · ${mEnt.area}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {main.note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">📝 {main.note}</p>}

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Competing options for this slot
          </p>
          <ul className="space-y-1.5">
            <OptionRow inst={main} isMain />
            {alts.map((a) => (
              <OptionRow key={a.entityId} inst={a} onMakeMain={() => onMakeMain(a.entityId)} />
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-400">
            Only the main option exports to Google Calendar. “Make main” swaps it in (the old main drops to Plan B).
          </p>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
          💬 comments · 📷 photos — live once wired to the trip
        </div>
      </div>
    </div>
  );
}

function OptionRow({ inst, isMain, onMakeMain }: { inst: PreviewInstance; isMain?: boolean; onMakeMain?: () => void }) {
  const ent = entityById.get(inst.entityId);
  const type = ent?.type ?? "uncategorised";
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
      <span>{emojiOf(type)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ent?.name}</div>
        {ent?.area && <div className="text-[11px] text-slate-400">{ent.parent ? `@${ent.parent}` : ent.area}</div>}
      </div>
      {isMain ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">main</span>
      ) : (
        <button
          onClick={onMakeMain}
          className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
        >
          make main ⇄
        </button>
      )}
    </li>
  );
}

// --- helpers -----------------------------------------------------------------

/** A slot's primary (confirmed/planned) instance + its Plan B alternatives. */
function splitInstances(slotId: string, instances: PreviewInstance[]) {
  const all = instances.filter((i) => i.slotId === slotId);
  const main = all.find((i) => i.capacity !== "planB");
  const alts = all.filter((i) => i !== main);
  return { main, alts };
}

/** Greedy column layout for overlapping blocks within a day. */
function layoutColumns(blocks: { id: string; start: number; end: number }[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const result = new Map<string, { col: number; count: number }>();
  let group: typeof sorted = [];
  let groupMaxEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    for (const b of group) {
      let placed = -1;
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= b.start) { colEnds[i] = b.end; placed = i; break; }
      }
      if (placed === -1) { placed = colEnds.length; colEnds.push(b.end); }
      result.set(b.id, { col: placed, count: 0 });
    }
    for (const b of group) result.get(b.id)!.count = colEnds.length;
    group = [];
    groupMaxEnd = -1;
  };
  for (const b of sorted) {
    if (group.length && b.start >= groupMaxEnd) flush();
    group.push(b);
    groupMaxEnd = Math.max(groupMaxEnd, b.end);
  }
  if (group.length) flush();
  return result;
}
