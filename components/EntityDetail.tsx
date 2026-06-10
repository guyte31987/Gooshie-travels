"use client";

import { useState } from "react";
import { ENTITY_TABS, type Entity, type TripSlot } from "@/lib/entities";
import { Comments } from "./Comments";
import { useTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { saveInstance, deleteInstanceOverride } from "@/lib/db";

/** The shared entity popup, opened from anywhere (Planning, Database, Itinerary,
 * Map). Shows every attribute plus "Appears in" → this trip → each appearance
 * (with its time + capacity), each expandable to its own comments/photos. */
export function EntityDetail({
  entity,
  tripId,
  tripName,
  onClose,
}: {
  entity: Entity;
  tripId: string;
  tripName: string;
  onClose: () => void;
}) {
  const type = ENTITY_TABS.find((t) => t.type === entity.type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{type?.emoji}</span>
              <h2 className="text-lg font-semibold">{entity.name}</h2>
              {entity.closed && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  CLOSED
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="font-medium">{type?.label}</span>
              {entity.generalArea && <span>· {entity.generalArea}</span>}
              {entity.area && <span>· {entity.area}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {entity.notes && <p className="text-sm text-slate-600">{entity.notes}</p>}

        <dl className="mt-3 space-y-1 text-xs">
          {entity.hours && <Row label="Hours">{entity.hours}</Row>}
          {entity.address && <Row label="Address">{entity.address}</Row>}
          {entity.price && <Row label="Price">{entity.price}</Row>}
          {entity.booking && <Row label="Booking">{entity.booking}</Row>}
          {entity.bestDay && <Row label="Best day">{entity.bestDay}</Row>}
          {entity.source && <Row label="Source">{entity.source}</Row>}
        </dl>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Appears in
          </h3>
          {entity.slots.length === 0 ? (
            <p className="text-sm text-slate-400">Not scheduled or planned for any trip yet.</p>
          ) : (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {tripName}
              </div>
              <ul>
                {entity.slots.map((s, i) => (
                  <Appearance key={i} slot={s} entity={entity} tripId={tripId} index={i} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Appearance({
  slot,
  entity,
  tripId,
  index,
}: {
  slot: TripSlot;
  entity: Entity;
  tripId: string;
  index: number;
}) {
  const { instanceMap } = useTripData();
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(slot.note ?? "");
  const [editingNote, setEditingNote] = useState(false);

  const override = slot.uid ? instanceMap.get(slot.uid) : undefined;
  const locked = slot.locked || override?.locked;
  const instanceId = slot.uid
    ? `${tripId}:${slot.uid}`
    : `${tripId}:${entity.id}:${slot.kind}:${slot.dayKey ?? index}`;

  const persist = (patch: Partial<{ locked: boolean; removed: boolean; note: string }>) => {
    if (!slot.uid) return;
    saveInstance(tripId, {
      id: slot.uid,
      tripId,
      entityId: entity.id,
      dayKey: slot.dayKey,
      time: slot.time,
      ...override,
      ...patch,
    });
  };

  const tone =
    slot.kind === "confirmed"
      ? "bg-emerald-50 text-emerald-700"
      : slot.kind === "planB"
        ? "bg-amber-50 text-amber-700"
        : "bg-indigo-50 text-indigo-700";
  const word = slot.kind === "confirmed" ? "Confirmed" : slot.kind === "planB" ? "Plan B" : "Planned";

  return (
    <li className="border-b border-slate-100 px-3 py-2 last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{word}</span>
        <span className="text-sm font-medium">{slot.dayKey ? dayPart(slot.label) : slot.label}</span>
        {slot.time && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {slot.time}
          </span>
        )}
        {locked && <span title="Locked — app-owned">🔒</span>}
        {slot.mismatch && <span className="text-xs text-rose-600">⚠️ differs from calendar</span>}
        <span className="ml-auto text-slate-300">{open ? "▲" : "▼"}</span>
      </button>
      {slot.note && <p className="mt-1 text-xs text-slate-500">{slot.note}</p>}
      {open && (
        <div className="mt-2">
          {canEdit && slot.uid && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => persist({ locked: !locked })}
                className={`rounded border px-2 py-1 font-medium ${
                  locked
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {locked ? "🔒 Locked — unlock" : "🔓 Lock (app-owned)"}
              </button>
              <button
                onClick={() => setEditingNote((v) => !v)}
                className="rounded border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"
              >
                Edit note
              </button>
              <button
                onClick={() => {
                  if (confirm("Remove this occurrence from the trip?")) persist({ removed: true });
                }}
                className="rounded border border-rose-200 px-2 py-1 font-medium text-rose-600 hover:bg-rose-50"
              >
                Remove
              </button>
              {override && (
                <button
                  onClick={() => deleteInstanceOverride(tripId, slot.uid!)}
                  className="text-slate-400 hover:underline"
                  title="Discard app overrides and trust the calendar again"
                >
                  reset to calendar
                </button>
              )}
            </div>
          )}
          {editingNote && (
            <div className="mb-2 flex gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="App note (advice, Plan B…)"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
              />
              <button
                onClick={() => {
                  persist({ note: noteDraft });
                  setEditingNote(false);
                }}
                className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
              >
                Save
              </button>
            </div>
          )}
          {locked && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Locked: the app owns this occurrence — re-sync won&apos;t overwrite it.
            </p>
          )}
          <Comments instanceId={instanceId} />
        </div>
      )}
    </li>
  );
}

/** Strip the trailing ", 6:00 PM" from a slot label (time shown separately). */
function dayPart(label: string): string {
  return label.replace(/,\s*\d{1,2}:\d{2}\s*[AP]M.*$/i, "");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-medium text-slate-400">{label}</dt>
      <dd className="text-slate-600">{children}</dd>
    </div>
  );
}
