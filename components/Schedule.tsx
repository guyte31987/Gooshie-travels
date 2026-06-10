"use client";

import { useMemo, useState } from "react";
import { useTripData } from "./TripData";
import { EntityDetail } from "./EntityDetail";
import { useAuth } from "./AuthProvider";
import { dayHeading } from "@/lib/ics";
import { indexByEventUid, ENTITY_TABS, type Entity, type ItinEvent } from "@/lib/entities";
import { saveInstance, deleteInstanceOverride, type Instance } from "@/lib/db";

function timeRange(e: ItinEvent, tz: string): string {
  if (e.isAllDay || typeof e.startMs !== "number") return "All day";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const start = f.format(new Date(e.startMs));
  if (typeof e.endMs === "number") return `${start} – ${f.format(new Date(e.endMs))}`;
  return start;
}

export function Schedule() {
  const { augmentedDays, tz, loading, entities, instanceMap, tripId, tripName, archivedInstances } =
    useTripData();
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";
  const [detail, setDetail] = useState<Entity | null>(null);
  const index = useMemo(() => indexByEventUid(entities), [entities]);
  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const emojiOf = (e: Entity) => ENTITY_TABS.find((t) => t.type === e.type)?.emoji ?? "";

  if (loading) return <Notice tone="muted">Loading itinerary…</Notice>;
  if (augmentedDays.length === 0)
    return <Notice tone="muted">No events found in the calendar yet.</Notice>;

  return (
    <div className="space-y-8">
      {augmentedDays.map((day) => (
        <section key={day.dayKey} className="scroll-mt-20">
          <div className="sticky top-0 z-10 -mx-4 bg-slate-50/90 px-4 py-2 backdrop-blur">
            <h2 className="text-lg font-semibold">{dayHeading(day.dayKey)}</h2>
          </div>

          {day.basedIn.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {day.basedIn.map((b) => (
                <span
                  key={b.uid}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  title={b.location}
                >
                  🛏 Based in: {b.summary}
                </span>
              ))}
            </div>
          )}

          <ol className="mt-3 space-y-2">
            {day.events.length === 0 && (
              <li className="text-sm text-slate-400">No scheduled events.</li>
            )}
            {day.events.map((e) => {
              const override = instanceMap.get(e.uid);
              if (override?.removed) return null;
              const linked =
                index.get(e.uid)?.entity ??
                (override?.entityId ? entityById.get(override.entityId) : undefined);
              return (
                <EventCard
                  key={e.uid}
                  e={e}
                  tz={tz}
                  override={override}
                  linked={linked}
                  canEdit={canEdit}
                  dayKey={day.dayKey}
                  onOpenDetail={setDetail}
                  emojiOf={emojiOf}
                  tripId={tripId}
                />
              );
            })}
          </ol>
        </section>
      ))}

      {canEdit && archivedInstances.length > 0 && (
        <ArchivedSection
          archivedInstances={archivedInstances}
          entityById={entityById}
          tripId={tripId}
          isAdmin={isAdmin}
        />
      )}

      {detail && (
        <EntityDetail
          entity={detail}
          tripId={tripId}
          tripName={tripName}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function EventCard({
  e,
  tz,
  override,
  linked,
  canEdit,
  dayKey,
  onOpenDetail,
  emojiOf,
  tripId,
}: {
  e: ItinEvent;
  tz: string;
  override: Instance | undefined;
  linked: Entity | undefined;
  canEdit: boolean;
  dayKey: string;
  onOpenDetail: (entity: Entity) => void;
  emojiOf: (e: Entity) => string;
  tripId: string;
}) {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingNoteDraft, setBookingNoteDraft] = useState(override?.bookingNote ?? "");
  const [bookingOffsetDraft, setBookingOffsetDraft] = useState(
    override?.bookingOffsetDays?.toString() ?? ""
  );

  const orphaned = !!e.orphaned;
  const locked = override?.locked;

  const entityNeedsBooking = linked?.needsBooking ?? false;
  const effectiveNeedsBooking =
    override?.needsBooking === true
      ? true
      : override?.needsBooking === false
        ? false
        : entityNeedsBooking;
  const isBooked = override?.booked ?? false;

  const persist = (patch: Partial<Instance>) => {
    saveInstance(tripId, {
      id: e.uid,
      tripId,
      entityId: linked?.id ?? override?.entityId,
      dayKey,
      startMs: e.startMs,
      time: e.isAllDay ? undefined : timeRange(e, tz),
      ...override,
      ...patch,
    });
  };

  const cardCls = orphaned
    ? "rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 shadow-sm"
    : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

  return (
    <li className={cardCls}>
      {orphaned && (
        <p className="mb-2 text-[11px] font-medium text-slate-400">
          🗂 Locked · calendar event deleted
        </p>
      )}

      <div className="flex items-baseline justify-between gap-3">
        {linked ? (
          <button
            onClick={() => onOpenDetail(linked)}
            className="group flex items-center gap-1.5 text-left"
          >
            <span>{emojiOf(linked)}</span>
            <h3 className="font-medium leading-snug text-indigo-700 underline-offset-2 group-hover:underline">
              {override?.title || e.summary}
            </h3>
            {locked && <span title="Locked">🔒</span>}
          </button>
        ) : (
          <h3 className="flex items-center gap-1.5 font-medium leading-snug">
            {override?.title || e.summary}
            {locked && <span title="Locked">🔒</span>}
          </h3>
        )}
        <span className="shrink-0 text-xs font-medium text-slate-500">{timeRange(e, tz)}</span>
      </div>

      {e.location && <p className="mt-1 text-sm text-slate-500">📍 {e.location}</p>}

      {e.description && !orphaned && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Planning note
          </div>
          <p className="whitespace-pre-line text-sm text-slate-600">{e.description}</p>
        </div>
      )}

      {/* Booking badge */}
      {effectiveNeedsBooking && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isBooked ? (
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
      )}

      {/* Editor action bar */}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-xs">
          <button
            onClick={() => {
              if (confirm("Archive this item? Editors can restore it from the archive."))
                persist({ removed: true });
            }}
            className="text-rose-400 hover:text-rose-600 hover:underline"
          >
            Archive
          </button>
          <button
            onClick={() => persist({ locked: !locked })}
            className={locked ? "text-amber-600 hover:underline" : "text-slate-400 hover:text-slate-600 hover:underline"}
          >
            {locked ? "🔒 Unlock" : "🔓 Lock"}
          </button>
          <button
            onClick={() => setBookingOpen((o) => !o)}
            className="text-slate-400 hover:text-slate-600 hover:underline"
          >
            📋 Booking
          </button>
          {linked && (
            <button
              onClick={() => onOpenDetail(linked)}
              className="ml-auto font-medium text-indigo-600 hover:underline"
            >
              Full details →
            </button>
          )}
        </div>
      )}

      {/* Booking form */}
      {bookingOpen && canEdit && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-500">Needs booking:</span>
            {(
              [
                { label: "Yes", value: true as boolean | null },
                { label: "No", value: false as boolean | null },
                {
                  label: `Default (${entityNeedsBooking ? "yes" : "no"})`,
                  value: null as boolean | null,
                },
              ] as const
            ).map(({ label, value }) => {
              const active =
                value === null
                  ? override?.needsBooking == null
                  : override?.needsBooking === value;
              return (
                <button
                  key={label}
                  onClick={() => persist({ needsBooking: value })}
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

          {effectiveNeedsBooking && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={isBooked}
                  onChange={(ev) => persist({ booked: ev.target.checked })}
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
                  title="How many days before the trip start to make the booking"
                />
              </div>
              <button
                onClick={() => {
                  persist({
                    bookingNote: bookingNoteDraft || undefined,
                    bookingOffsetDays: bookingOffsetDraft ? Number(bookingOffsetDraft) : undefined,
                  });
                  setBookingOpen(false);
                }}
                className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
              >
                Save
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ArchivedSection({
  archivedInstances,
  entityById,
  tripId,
  isAdmin,
}: {
  archivedInstances: Instance[];
  entityById: Map<string, Entity>;
  tripId: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        🗃 Archived ({archivedInstances.length}) <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {archivedInstances.map((i) => {
            const entity = i.entityId ? entityById.get(i.entityId) : undefined;
            const name = i.title ?? entity?.name ?? i.id;
            return (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{name}</span>
                  {i.dayKey && (
                    <span className="ml-2 text-xs text-slate-400">{i.dayKey}</span>
                  )}
                  {i.locked && (
                    <span className="ml-2 text-[11px] text-amber-600">🔒 was locked</span>
                  )}
                </div>
                <button
                  onClick={() => saveInstance(tripId, { ...i, removed: false })}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Restore
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      if (confirm("Permanently delete this record? This cannot be undone."))
                        deleteInstanceOverride(tripId, i.id);
                    }}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Delete forever
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "error" | "muted" }) {
  const cls =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-white text-slate-500";
  return <div className={`rounded-xl border p-4 text-sm ${cls}`}>{children}</div>;
}
