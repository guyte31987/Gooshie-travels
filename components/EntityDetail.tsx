"use client";

import { useState } from "react";
import { ENTITY_TABS, type Entity, type TripSlot } from "@/lib/entities";
import { Comments } from "./Comments";
import { useTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { saveInstance, deleteInstanceOverride, type Instance } from "@/lib/db";

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
  const [editingBooking, setEditingBooking] = useState(false);

  const override = slot.uid ? instanceMap.get(slot.uid) : undefined;

  const [bookingNoteDraft, setBookingNoteDraft] = useState(override?.bookingNote ?? "");
  const [bookingOffsetDraft, setBookingOffsetDraft] = useState(
    override?.bookingOffsetDays?.toString() ?? ""
  );
  const locked = slot.locked || override?.locked;
  const instanceId = slot.uid
    ? `${tripId}:${slot.uid}`
    : `${tripId}:${entity.id}:${slot.kind}:${slot.dayKey ?? index}`;

  const persist = (patch: Partial<Instance>) => {
    if (!slot.uid) return;
    saveInstance(tripId, {
      id: slot.uid,
      tripId,
      entityId: entity.id,
      dayKey: slot.dayKey,
      startMs: slot.startMs,
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

          {/* Booking section */}
          {canEdit && slot.uid && (
            <div className="mb-2">
              <button
                onClick={() => setEditingBooking((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                📋 Booking
              </button>
              {editingBooking && (
                <BookingForm
                  override={override}
                  entityNeedsBooking={entity.needsBooking ?? false}
                  onPersist={persist}
                  bookingNoteDraft={bookingNoteDraft}
                  setBookingNoteDraft={setBookingNoteDraft}
                  bookingOffsetDraft={bookingOffsetDraft}
                  setBookingOffsetDraft={setBookingOffsetDraft}
                  onClose={() => setEditingBooking(false)}
                />
              )}
            </div>
          )}

          {/* Booking status (read-only) */}
          {(() => {
            const entityNeedsBooking = entity.needsBooking ?? false;
            const effective =
              override?.needsBooking === true
                ? true
                : override?.needsBooking === false
                  ? false
                  : entityNeedsBooking;
            if (!effective) return null;
            return (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {override?.booked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    ✅ Booked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    📋 Needs booking
                  </span>
                )}
                {override?.bookingOffsetDays != null && (
                  <span className="text-[11px] text-slate-400">
                    · Book {override.bookingOffsetDays} days before trip
                  </span>
                )}
                {override?.bookingNote && (
                  <span className="text-[11px] italic text-slate-500">{override.bookingNote}</span>
                )}
              </div>
            );
          })()}

          <Comments instanceId={instanceId} />
        </div>
      )}
    </li>
  );
}

function BookingForm({
  override,
  entityNeedsBooking,
  onPersist,
  bookingNoteDraft,
  setBookingNoteDraft,
  bookingOffsetDraft,
  setBookingOffsetDraft,
  onClose,
}: {
  override: Instance | undefined;
  entityNeedsBooking: boolean;
  onPersist: (patch: Partial<Instance>) => void;
  bookingNoteDraft: string;
  setBookingNoteDraft: (v: string) => void;
  bookingOffsetDraft: string;
  setBookingOffsetDraft: (v: string) => void;
  onClose: () => void;
}) {
  const effective =
    override?.needsBooking === true
      ? true
      : override?.needsBooking === false
        ? false
        : entityNeedsBooking;

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-slate-500">Needs booking:</span>
        {(
          [
            { label: "Yes", value: true as boolean | null },
            { label: "No", value: false as boolean | null },
            { label: `Default (${entityNeedsBooking ? "yes" : "no"})`, value: null as boolean | null },
          ] as const
        ).map(({ label, value }) => {
          const active =
            value === null ? override?.needsBooking == null : override?.needsBooking === value;
          return (
            <button
              key={label}
              onClick={() => onPersist({ needsBooking: value })}
              className={`rounded px-2 py-0.5 ${
                active
                  ? "bg-slate-800 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {effective && (
        <>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={override?.booked ?? false}
              onChange={(ev) => onPersist({ booked: ev.target.checked })}
              className="rounded"
            />
            Mark as booked
          </label>
          <div className="flex gap-2">
            <input
              value={bookingNoteDraft}
              onChange={(ev) => setBookingNoteDraft(ev.target.value)}
              placeholder="Note (platform, phone, Resy…)"
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
            />
            <input
              type="number"
              min={1}
              value={bookingOffsetDraft}
              onChange={(ev) => setBookingOffsetDraft(ev.target.value)}
              placeholder="Days before"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
              title="How many days before the trip to make this booking"
            />
          </div>
          <button
            onClick={() => {
              onPersist({
                bookingNote: bookingNoteDraft || undefined,
                bookingOffsetDays: bookingOffsetDraft ? Number(bookingOffsetDraft) : undefined,
              });
              onClose();
            }}
            className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
          >
            Save
          </button>
        </>
      )}
    </div>
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
