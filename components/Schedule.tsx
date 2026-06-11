"use client";

import { useMemo, useState } from "react";
import { useTripData } from "./TripData";
import { EntityDetail } from "./EntityDetail";
import { Comments } from "./Comments";
import { useAuth } from "./AuthProvider";
import { dayHeading } from "@/lib/ics";
import { indexByEventUid, ENTITY_TABS, type Entity, type ItinEvent } from "@/lib/entities";
import { saveInstance, deleteInstanceOverride, type Instance } from "@/lib/db";
import { cleanCalendarDescription } from "@/lib/sync";

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
  const [popupEvent, setPopupEvent] = useState<{ e: ItinEvent; dayKey: string } | null>(null);
  const [detail, setDetail] = useState<Entity | null>(null);

  const index = useMemo(() => indexByEventUid(entities), [entities]);
  const entityById = useMemo(() => new Map(entities.map((en) => [en.id, en])), [entities]);
  const emojiOf = (en: Entity) => ENTITY_TABS.find((t) => t.type === en.type)?.emoji ?? "";

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
                  emojiOf={emojiOf}
                  onOpenPopup={() => setPopupEvent({ e, dayKey: day.dayKey })}
                  onOpenEntity={(en) => { setDetail(en); }}
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

      {popupEvent && (
        <EventPopup
          e={popupEvent.e}
          dayKey={popupEvent.dayKey}
          tz={tz}
          override={instanceMap.get(popupEvent.e.uid)}
          linked={
            index.get(popupEvent.e.uid)?.entity ??
            (instanceMap.get(popupEvent.e.uid)?.entityId
              ? entityById.get(instanceMap.get(popupEvent.e.uid)!.entityId!)
              : undefined)
          }
          canEdit={canEdit}
          tripId={tripId}
          emojiOf={emojiOf}
          onClose={() => setPopupEvent(null)}
          onOpenEntity={(en) => { setDetail(en); setPopupEvent(null); }}
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

// --- Compact card (tap to open EventPopup) ---

function EventCard({
  e,
  tz,
  override,
  linked,
  emojiOf,
  onOpenPopup,
  onOpenEntity,
}: {
  e: ItinEvent;
  tz: string;
  override: Instance | undefined;
  linked: Entity | undefined;
  emojiOf: (en: Entity) => string;
  onOpenPopup: () => void;
  onOpenEntity: (en: Entity) => void;
}) {
  const orphaned = !!e.orphaned;
  const scheduleLocked = override?.scheduleLocked;

  // One-line preview of the note. Once locked the app-owned note wins; otherwise
  // mirror the live calendar description (cleaned of boilerplate/links).
  const notePreview = (
    cleanCalendarDescription(scheduleLocked ? override?.scheduleNote : e.description) ?? ""
  ).trim();

  const entityNeedsBooking = linked?.needsBooking ?? false;
  const effectiveNeedsBooking =
    override?.needsBooking === true ? true
    : override?.needsBooking === false ? false
    : entityNeedsBooking;
  const isBooked = override?.booked ?? false;

  const cardCls = orphaned
    ? "rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 shadow-sm cursor-pointer hover:bg-slate-100/60 transition"
    : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer hover:bg-slate-50 transition";

  return (
    <li className={cardCls} onClick={onOpenPopup}>
      {orphaned && (
        <p className="mb-1.5 text-[11px] font-medium text-slate-400">
          🗂 Locked · calendar event deleted
        </p>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {linked && <span>{emojiOf(linked)}</span>}
          <h3 className="truncate font-medium leading-snug">
            {override?.title || e.summary}
          </h3>
          {scheduleLocked && <span title="Schedule locked" className="shrink-0">🔒</span>}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-500">{timeRange(e, tz)}</span>
      </div>

      {e.location && <p className="mt-1 truncate text-sm text-slate-500">📍 {e.location}</p>}

      {notePreview && (
        <p className="mt-1 line-clamp-1 text-xs text-slate-400">📝 {notePreview}</p>
      )}

      {/* Entity link — tapping stops propagation so it opens EntityDetail directly */}
      {linked && (
        <button
          onClick={(ev) => { ev.stopPropagation(); onOpenEntity(linked); }}
          className="mt-1.5 text-xs font-medium text-indigo-500 hover:underline"
        >
          {emojiOf(linked)} {linked.name} →
        </button>
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
              · {override.bookingOffsetDays} days before trip
            </span>
          )}
        </div>
      )}
    </li>
  );
}

// --- EventPopup (full instance detail) ---

function EventPopup({
  e,
  dayKey,
  tz,
  override,
  linked,
  canEdit,
  tripId,
  emojiOf,
  onClose,
  onOpenEntity,
}: {
  e: ItinEvent;
  dayKey: string;
  tz: string;
  override: Instance | undefined;
  linked: Entity | undefined;
  canEdit: boolean;
  tripId: string;
  emojiOf: (en: Entity) => string;
  onClose: () => void;
  onOpenEntity: (en: Entity) => void;
}) {
  const orphaned = !!e.orphaned;
  const scheduleLocked = override?.scheduleLocked;
  const entityInstanceLocked = override?.entityInstanceLocked;

  const [scheduleNoteDraft, setScheduleNoteDraft] = useState(override?.scheduleNote ?? "");
  const [entityNoteDraft, setEntityNoteDraft] = useState(override?.entityInstanceNote ?? "");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingNoteDraft, setBookingNoteDraft] = useState(override?.bookingNote ?? "");
  const [bookingOffsetDraft, setBookingOffsetDraft] = useState(
    override?.bookingOffsetDays?.toString() ?? ""
  );

  const entityNeedsBooking = linked?.needsBooking ?? false;
  const effectiveNeedsBooking =
    override?.needsBooking === true ? true
    : override?.needsBooking === false ? false
    : entityNeedsBooking;

  const instanceId = `${tripId}:${e.uid}`;

  const persist = (patch: Partial<Instance>) => {
    // Investing in an occurrence (a note, a booking) auto-locks it so it survives
    // a later calendar deletion — only locked instances are re-injected as orphans.
    const INVEST_KEYS: (keyof Instance)[] = [
      "scheduleNote",
      "entityInstanceNote",
      "booked",
      "bookingNote",
      "bookingOffsetDays",
    ];
    const autoLock = patch.scheduleLocked === undefined && INVEST_KEYS.some((k) => k in patch);
    saveInstance(tripId, {
      id: e.uid,
      tripId,
      entityId: linked?.id ?? override?.entityId,
      dayKey,
      startMs: e.startMs,
      time: e.isAllDay ? undefined : timeRange(e, tz),
      ...override,
      ...patch,
      ...(autoLock ? { scheduleLocked: true, title: override?.title ?? e.summary } : {}),
    });
  };

  // Posting a comment is an investment too — lock the occurrence so a later
  // calendar deletion doesn't strand the thread.
  const lockOnComment = () => {
    if (!override?.scheduleLocked) persist({ scheduleLocked: true, title: override?.title ?? e.summary });
  };

  const lockSchedule = () => {
    const calNote = e.description ?? "";
    const existing = override?.scheduleNote ?? "";
    const merged =
      calNote && !existing.startsWith(calNote)
        ? calNote + (existing ? "\n\n" + existing : "")
        : existing || calNote;
    const patch: Partial<Instance> = {
      scheduleLocked: true,
      entityInstanceLocked: true,
    };
    if (merged) patch.scheduleNote = merged;
    persist(patch);
    setScheduleNoteDraft(merged);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {orphaned && (
              <p className="mb-1 text-[11px] font-medium text-slate-400">
                🗂 Locked · calendar event deleted
              </p>
            )}
            <h2 className="text-lg font-semibold leading-snug">
              {override?.title || e.summary}
            </h2>
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{timeRange(e, tz)}</span>
              {e.location && <span>📍 {e.location}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {/* ── Schedule section ── */}
        <div className="space-y-3">
          {/* Schedule note */}
          {scheduleLocked ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Note
              </p>
              {canEdit ? (
                <div className="space-y-1.5">
                  <textarea
                    value={scheduleNoteDraft}
                    onChange={(ev) => setScheduleNoteDraft(ev.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Your notes for this event…"
                  />
                  {scheduleNoteDraft !== (override?.scheduleNote ?? "") && (
                    <button
                      onClick={() => persist({ scheduleNote: scheduleNoteDraft })}
                      className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
                    >
                      Save note
                    </button>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {override?.scheduleNote}
                </p>
              )}
            </div>
          ) : e.description ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Planning note (from calendar)
              </p>
              <p className="whitespace-pre-line text-sm text-slate-600">{e.description}</p>
              {canEdit && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Lock to capture and edit this note in the app.
                </p>
              )}
            </div>
          ) : null}

          {/* Schedule lock / archive */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {scheduleLocked ? (
                <button
                  onClick={() => persist({ scheduleLocked: false })}
                  className="text-amber-600 hover:underline"
                >
                  🔒 Unlock schedule
                </button>
              ) : (
                <button onClick={lockSchedule} className="text-slate-500 hover:underline">
                  🔓 Lock &amp; capture note
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm("Archive this event? Editors can restore it.")) {
                    persist({ removed: true });
                    onClose();
                  }
                }}
                className="text-rose-400 hover:text-rose-600 hover:underline"
              >
                Archive
              </button>
            </div>
          )}
        </div>

        {/* ── Entity instance section (only if linked to an entity) ── */}
        {linked && (
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => onOpenEntity(linked)}
                className="flex items-center gap-1.5 font-medium text-indigo-600 hover:underline"
              >
                {emojiOf(linked)} {linked.name} →
              </button>
              {canEdit && (
                <button
                  onClick={() => persist({ entityInstanceLocked: !entityInstanceLocked })}
                  className={`text-xs ${entityInstanceLocked ? "text-amber-600" : "text-slate-400"} hover:underline`}
                >
                  {entityInstanceLocked ? "🔒 Instance locked" : "🔓 Lock instance"}
                </button>
              )}
            </div>

            {/* Entity details (read-only summary) */}
            {(linked.hours || linked.price || linked.booking) && (
              <dl className="space-y-0.5 text-xs text-slate-500">
                {linked.hours && <div>🕑 {linked.hours}</div>}
                {linked.price && <div>💰 {linked.price}</div>}
                {linked.booking && <div>🔗 {linked.booking}</div>}
              </dl>
            )}

            {/* Entity instance note */}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Visit note
              </p>
              {canEdit ? (
                <div className="space-y-1.5">
                  <textarea
                    value={entityNoteDraft}
                    onChange={(ev) => setEntityNoteDraft(ev.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Notes about this specific visit…"
                  />
                  {entityNoteDraft !== (override?.entityInstanceNote ?? "") && (
                    <button
                      onClick={() => persist({ entityInstanceNote: entityNoteDraft })}
                      className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white"
                    >
                      Save
                    </button>
                  )}
                </div>
              ) : override?.entityInstanceNote ? (
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {override.entityInstanceNote}
                </p>
              ) : (
                <p className="text-xs text-slate-400">No visit note yet.</p>
              )}
            </div>

            {/* Booking */}
            <div>
              <button
                onClick={() => setBookingOpen((o) => !o)}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                📋 Booking {bookingOpen ? "▲" : "▼"}
              </button>
              {bookingOpen && (
                <BookingForm
                  override={override}
                  entityNeedsBooking={entityNeedsBooking}
                  onPersist={persist}
                  bookingNoteDraft={bookingNoteDraft}
                  setBookingNoteDraft={setBookingNoteDraft}
                  bookingOffsetDraft={bookingOffsetDraft}
                  setBookingOffsetDraft={setBookingOffsetDraft}
                  onClose={() => setBookingOpen(false)}
                />
              )}
              {/* Booking badge (always visible if set) */}
              {effectiveNeedsBooking && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
              )}
            </div>

            {/* Instance-level comments */}
            <div className="border-t border-slate-100 pt-3">
              <Comments instanceId={instanceId} label="Comments on this visit" onPosted={lockOnComment} />
            </div>
          </div>
        )}

        {/* Unlinked event: show instance comments if any */}
        {!linked && override && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <Comments instanceId={instanceId} onPosted={lockOnComment} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Booking form (shared between EventPopup and EntityDetail) ---

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

// --- Archived section ---

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
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{name}</span>
                  {i.dayKey && <span className="ml-2 text-xs text-slate-400">{i.dayKey}</span>}
                  {i.scheduleLocked && (
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
                      if (confirm("Permanently delete? Cannot be undone."))
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
