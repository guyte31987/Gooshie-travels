"use client";

import { useState } from "react";
import { ENTITY_TABS, type Entity, type TripSlot } from "@/lib/entities";
import { googleMapsUrl, externalUrl, instagramUrl, instagramHandle } from "@/lib/geo";
import { Comments } from "./Comments";
import { EntityForm } from "./EntityForm";
import { useTripData, useOptionalTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { saveInstance, deleteInstanceOverride, type Instance } from "@/lib/db";

/** The entity popup — place-level info, general comments, and per-visit appearances.
 *  Opened from entity name links in EventPopup, Planning, Map, or Database. */
export function EntityDetail({
  entity,
  tripId = "",
  tripName = "",
  onClose,
}: {
  entity: Entity;
  tripId?: string;
  tripName?: string;
  onClose: () => void;
}) {
  const type = ENTITY_TABS.find((t) => t.type === entity.type || (entity.type === "party" && t.type === "club"));
  const { isAdmin, role: authRole } = useAuth();
  const canEdit = isAdmin || authRole === "editor";
  const [editing, setEditing] = useState(false);
  const tripData = useOptionalTripData();
  const childEntities = (tripData?.entities ?? []).filter(
    (e) => e.parentId === entity.id
  );
  const parentEntity = entity.parentId
    ? (tripData?.entities ?? []).find((e) => e.id === entity.parentId)
    : undefined;
  const mapsHref = googleMapsUrl({
    name: entity.name,
    address: entity.address,
    area: entity.area ?? entity.generalArea,
    lat: entity.lat,
    lng: entity.lng,
  });
  const instagramHref = instagramUrl(entity.instagram);
  const igHandle = instagramHandle(entity.instagram);

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Entity header */}
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
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Edit
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
        </div>

        {/* Entity notes + details */}
        {entity.notes && <p className="text-sm text-slate-600">{entity.notes}</p>}
        <dl className="mt-3 space-y-1 text-xs">
          {entity.hours && <Row label="Hours">{entity.hours}</Row>}
          {entity.address && (
            <Row label="Address">
              {entity.address}
              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 font-medium text-indigo-600 hover:underline"
                >
                  Google Maps ↗
                </a>
              )}
            </Row>
          )}
          {!entity.address && mapsHref && (
            <Row label="Map">
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                Open in Google Maps ↗
              </a>
            </Row>
          )}
          {entity.website && (
            <Row label="Website">
              <a
                href={externalUrl(entity.website) ?? entity.website}
                target="_blank"
                rel="noreferrer"
                className="break-all font-medium text-indigo-600 hover:underline"
              >
                {entity.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
              </a>
            </Row>
          )}
          {entity.instagram && instagramHref && (
            <Row label="Instagram">
              <a
                href={instagramHref}
                target="_blank"
                rel="noreferrer"
                className="break-all font-medium text-indigo-600 hover:underline"
              >
                {igHandle} ↗
              </a>
            </Row>
          )}
          {entity.price && <Row label="Price">{entity.price}</Row>}
          {entity.booking && <Row label="Booking">{entity.booking}</Row>}
          {entity.bestDay && <Row label="Best day">{entity.bestDay}</Row>}
          {entity.source && <Row label="Source">{entity.source}</Row>}
        </dl>

        {parentEntity && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Venue: <span className="font-medium text-slate-700">{parentEntity.name}</span>
          </div>
        )}

        {childEntities.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Events at this venue
            </h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {childEntities.map((child) => {
                const childTab = ENTITY_TABS.find((t) => t.type === child.type || (child.type === "party" && t.type === "club"));
                const hasScheduled = child.slots.some((s) => s.kind === "confirmed");
                return (
                  <li key={child.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span>{childTab?.emoji}</span>
                    <span className="flex-1 font-medium">{child.name}</span>
                    {hasScheduled && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        scheduled
                      </span>
                    )}
                    {child.slots.filter(s => s.kind !== "confirmed").length > 0 && !hasScheduled && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        planned
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Entity-level comments */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Comments entityId={entity.id} label="Comments about this place" />
        </div>

        {/* Appearances in this trip */}
        {tripId && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            This trip
          </h3>
          {entity.slots.length === 0 ? (
            <p className="text-sm text-slate-400">Not scheduled or planned yet.</p>
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
        )}
      </div>
    </div>

    {editing && (
      <EntityForm
        entity={{ id: entity.id, name: entity.name, type: entity.type, generalArea: entity.generalArea, area: entity.area, address: entity.address, website: entity.website, instagram: entity.instagram, lat: entity.lat, lng: entity.lng, hours: entity.hours, price: entity.price, source: entity.source, booking: entity.booking, notes: entity.notes, closed: entity.closed, bestDay: entity.bestDay, needsBooking: entity.needsBooking }}
        onClose={() => setEditing(false)}
      />
    )}
    </>
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
  const [editingBooking, setEditingBooking] = useState(false);
  const [bookingNoteDraft, setBookingNoteDraft] = useState("");
  const [bookingOffsetDraft, setBookingOffsetDraft] = useState("");

  const override = slot.uid ? instanceMap.get(slot.uid) : undefined;

  const openBookingForm = () => {
    setBookingNoteDraft(override?.bookingNote ?? "");
    setBookingOffsetDraft(override?.bookingOffsetDays?.toString() ?? "");
    setEditingBooking(true);
  };

  const entityInstanceLocked = slot.locked || override?.entityInstanceLocked;
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

  const entityNeedsBooking = entity.needsBooking ?? false;
  const effectiveNeedsBooking =
    override?.needsBooking === true ? true
    : override?.needsBooking === false ? false
    : entityNeedsBooking;

  const tone =
    slot.kind === "confirmed"
      ? "bg-emerald-50 text-emerald-700"
      : slot.kind === "planB"
        ? "bg-amber-50 text-amber-700"
        : "bg-indigo-50 text-indigo-700";
  const word =
    slot.kind === "confirmed" ? "In Schedule" : slot.kind === "planB" ? "Plan B" : "Alternative";

  return (
    <li className="border-b border-slate-100 px-3 py-2 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{word}</span>
        <span className="text-sm font-medium">{slot.dayKey ? dayPart(slot.label) : slot.label}</span>
        {slot.time && (
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {slot.time}
          </span>
        )}
        {entityInstanceLocked && <span title="Instance locked">🔒</span>}
        {slot.mismatch && <span className="text-xs text-rose-600">⚠️ differs from calendar</span>}
        <span className="ml-auto text-slate-300">{open ? "▲" : "▼"}</span>
      </button>

      {/* Entity instance note (read summary) */}
      {override?.entityInstanceNote && (
        <p className="mt-1 text-xs text-slate-500">{override.entityInstanceNote}</p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          {canEdit && slot.uid && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => persist({ entityInstanceLocked: !entityInstanceLocked })}
                className={`rounded border px-2 py-1 font-medium ${
                  entityInstanceLocked
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {entityInstanceLocked ? "🔒 Locked — unlock instance" : "🔓 Lock instance"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Archive this occurrence?")) persist({ removed: true });
                }}
                className="rounded border border-rose-200 px-2 py-1 font-medium text-rose-600 hover:bg-rose-50"
              >
                Archive
              </button>
              {override && (
                <button
                  onClick={() => deleteInstanceOverride(tripId, slot.uid!)}
                  className="text-slate-400 hover:underline"
                  title="Discard all app overrides and trust the calendar again"
                >
                  reset to calendar
                </button>
              )}
            </div>
          )}

          {entityInstanceLocked && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              Instance locked — entity data for this visit is app-owned.
            </p>
          )}

          {/* Booking */}
          {canEdit && slot.uid && (
            <div>
              <button
                onClick={() => editingBooking ? setEditingBooking(false) : openBookingForm()}
                className="text-xs text-slate-400 hover:underline"
              >
                📋 Booking
              </button>
              {editingBooking && (
                <BookingForm
                  override={override}
                  entityNeedsBooking={entityNeedsBooking}
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

          {effectiveNeedsBooking && (
            <div className="flex flex-wrap items-center gap-2">
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
                  · {override.bookingOffsetDays} days before trip
                </span>
              )}
            </div>
          )}

          {/* Entity instance comments */}
          <div className="border-t border-slate-100 pt-2">
            <Comments instanceId={instanceId} label="Comments on this visit" />
          </div>
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
    override?.needsBooking === true ? true
    : override?.needsBooking === false ? false
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
