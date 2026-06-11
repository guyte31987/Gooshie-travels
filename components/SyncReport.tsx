"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildEntities,
  buildSyncReport,
  ENTITY_TABS,
  type EntityType,
  type ItinDay,
  type SyncIssue,
} from "@/lib/entities";
import {
  subscribeEntities,
  subscribeTripItems,
  saveEntity,
  saveTripItem,
  subscribeDismissedIssues,
  setDismissedIssues,
  getCalendarBaseline,
  saveCalendarBaseline,
  type CalendarBaseline,
  type DBEntity,
  type TripItem,
} from "@/lib/db";
import { buildSyncDiff, cleanCalendarDescription, type SyncCalEvent, type SyncItem } from "@/lib/sync";
import { diffCalendars } from "@/lib/calendar-diff";
import { suggestGeneralArea } from "@/lib/areas";
import { slugId } from "@/lib/slug";
import { TRIPS } from "@/lib/trips";

const TRIP = TRIPS[0];

// --- helpers -----------------------------------------------------------------

const issueKey = (i: SyncIssue) => `${i.severity}:${i.kind}:${i.entity}`;

type DiffSnapshot = { days: ItinDay[]; tz: string; dbEntities: DBEntity[]; items: TripItem[] };

// --- main component ----------------------------------------------------------

export function SyncReport() {
  const [dbEntities, setDbEntities] = useState<DBEntity[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [snapshot, setSnapshot] = useState<DiffSnapshot | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<CalendarBaseline | null>(null);
  const [markingSeen, setMarkingSeen] = useState(false);
  const [processed, setProcessed] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // New-item name/type overrides (uid → edits)
  const [newEdits, setNewEdits] = useState<Map<string, { name: string; type: EntityType }>>(new Map());

  const dbEntitiesRef = useRef(dbEntities);
  const itemsRef = useRef(items);
  useEffect(() => { dbEntitiesRef.current = dbEntities; }, [dbEntities]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const u1 = subscribeEntities(setDbEntities);
    const u2 = subscribeTripItems(TRIP.id, setItems);
    const u3 = subscribeDismissedIssues(setDismissed);
    getCalendarBaseline().then(setBaseline).catch(() => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  const runSync = useCallback(async (fresh = false) => {
    setLoading(true);
    setProcessed(new Map());
    setNewEdits(new Map());
    try {
      const res = await fetch(`/api/itinerary${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const data = await res.json();
      const days: ItinDay[] = data.days ?? [];
      const tz: string = data.tz ?? "Europe/London";
      setSyncedAt(data.syncedAt ?? new Date().toISOString());
      setEventCount(data.count ?? 0);
      setSnapshot({ days, tz, dbEntities: dbEntitiesRef.current, items: itemsRef.current });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { runSync(false); }, [runSync]);

  const diff = useMemo(
    () => snapshot
      ? buildSyncDiff({ days: snapshot.days, dbEntities: snapshot.dbEntities, items: snapshot.items, tripAreas: TRIP.areas })
      : [],
    [snapshot]
  );

  const calendarChanges = useMemo(() => {
    if (!snapshot || !baseline) return [];
    return diffCalendars(baseline.days, snapshot.days, snapshot.tz);
  }, [snapshot, baseline]);

  const markSeen = async () => {
    if (!snapshot) return;
    setMarkingSeen(true);
    try {
      const next: CalendarBaseline = { days: snapshot.days, syncedAt: syncedAt ?? new Date().toISOString() };
      await saveCalendarBaseline(next);
      setBaseline(next);
    } finally {
      setMarkingSeen(false);
    }
  };

  const planIssues = useMemo(() => {
    if (!snapshot) return [];
    const entities = buildEntities(snapshot.days, snapshot.tz);
    const all = buildSyncReport(entities);
    const dismissedSet = new Set(dismissed);
    return all.filter((i) => !dismissedSet.has(issueKey(i)));
  }, [snapshot, dismissed]);

  const mark = (key: string, action: string) =>
    setProcessed((p) => new Map(p).set(key, action));

  const isSaving = (key: string) => saving.has(key);
  const addSaving = (key: string) => setSaving((s) => new Set(s).add(key));
  const doneSaving = (key: string) => setSaving((s) => { const n = new Set(s); n.delete(key); return n; });

  // --- save helpers ----------------------------------------------------------

  const saveNew = async (event: SyncCalEvent, overrideName?: string, overrideType?: EntityType) => {
    const name = overrideName ?? event.extractedName;
    const type = overrideType ?? event.type;
    const id = slugId(type, name);
    addSaving(event.uid);
    try {
      await saveEntity({
        id,
        name,
        type,
        generalArea: suggestGeneralArea(event.location) ?? suggestGeneralArea(name),
        address: event.location,
        notes: cleanCalendarDescription(event.description),
        calendarSource: true,
      });
      await saveTripItem(TRIP.id, { entityId: id, added: true });
      mark(event.uid, "saved");
    } finally {
      doneSaving(event.uid);
    }
  };

  const linkFuzzy = async (event: SyncCalEvent, entityId: string) => {
    addSaving(event.uid);
    try {
      await saveTripItem(TRIP.id, { entityId, added: true });
      mark(event.uid, "linked");
    } finally {
      doneSaving(event.uid);
    }
  };

  const updateType = async (entity: DBEntity, newType: EntityType) => {
    addSaving(entity.id);
    try {
      await saveEntity({ ...entity, type: newType });
      mark(entity.id, "updated");
    } finally {
      doneSaving(entity.id);
    }
  };

  // Park a noisy entity into a bucket (Travel / Admin / Misc). Identical write to
  // updateType, but framed as "stop flagging this" rather than "fix the type".
  const parkEntity = async (entity: DBEntity, bucket: EntityType) => {
    addSaving(entity.id);
    try {
      await saveEntity({ ...entity, type: bucket });
      mark(entity.id, "parked");
    } finally {
      doneSaving(entity.id);
    }
  };

  const removeOrphaned = async (entityId: string) => {
    addSaving(entityId);
    try {
      await saveTripItem(TRIP.id, { entityId, removed: true, added: false });
      mark(entityId, "removed");
    } finally {
      doneSaving(entityId);
    }
  };

  // Bulk: keep every entity in a group (just clears them from this report — no
  // data change) or remove them all from the trip in one go.
  const keepAll = (entityIds: string[]) =>
    setProcessed((p) => { const n = new Map(p); for (const id of entityIds) n.set(id, "kept"); return n; });

  const removeAll = async (entityIds: string[]) => {
    for (const id of entityIds) await removeOrphaned(id);
  };

  // --- filtered diff sections ------------------------------------------------

  const visible = (key: string) => !processed.has(key);
  const newItems = diff.filter((i): i is Extract<SyncItem, { status: "new" }> => i.status === "new" && visible(i.event.uid));
  const fuzzyItems = diff.filter((i): i is Extract<SyncItem, { status: "fuzzy" }> => i.status === "fuzzy" && visible(i.event.uid));
  const typeChangedItems = diff.filter((i): i is Extract<SyncItem, { status: "type_changed" }> => i.status === "type_changed" && visible(i.entity.id));
  const orphanedItems = diff.filter((i): i is Extract<SyncItem, { status: "orphaned" }> => i.status === "orphaned" && visible(i.entity.id));
  // Split orphans: genuine ones (added or auto-imported, but no calendar event)
  // vs candidate places that merely live in a trip area and aren't scheduled yet.
  const genuineOrphans = orphanedItems.filter((i) => i.expected);
  const candidatePlaces = orphanedItems.filter((i) => !i.expected);
  const matchedItems = diff.filter((i): i is Extract<SyncItem, { status: "matched" }> => i.status === "matched");

  const saveAllNew = async () => {
    for (const item of newItems) {
      const edit = newEdits.get(item.event.uid);
      await saveNew(item.event, edit?.name, edit?.type);
    }
  };

  const issueTotal = newItems.length + fuzzyItems.length + typeChangedItems.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {syncedAt
            ? `Last synced ${new Date(syncedAt).toLocaleString()} · ${eventCount} events · ${dbEntities.length} in DB`
            : "—"}
        </div>
        <button
          onClick={() => runSync(true)}
          disabled={loading}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {loading ? "Running…" : "↻ Re-sync now"}
        </button>
      </div>

      {/* Summary bar */}
      {snapshot && (
        <div className="mb-5 grid grid-cols-5 gap-2 text-center text-xs">
          {[
            { n: matchedItems.length, label: "matched", tone: "text-emerald-600" },
            { n: newItems.length, label: "new", tone: newItems.length ? "text-sky-600" : "text-slate-300" },
            { n: fuzzyItems.length, label: "possible match", tone: fuzzyItems.length ? "text-amber-600" : "text-slate-300" },
            { n: typeChangedItems.length, label: "type mismatch", tone: typeChangedItems.length ? "text-violet-600" : "text-slate-300" },
            { n: genuineOrphans.length, label: "missing", tone: genuineOrphans.length ? "text-rose-500" : "text-slate-300" },
          ].map(({ n, label, tone }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white py-2">
              <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
              <div className="text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && !snapshot && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">Building sync report…</p>
      )}

      {/* CALENDAR CHANGES SINCE LAST SYNC */}
      {snapshot && (
        <Section
          title={baseline ? `Calendar changes since last sync (${calendarChanges.length})` : "Calendar changes"}
          tone="indigo"
          action={
            <button
              onClick={markSeen}
              disabled={markingSeen}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {markingSeen ? "Saving…" : baseline ? "Mark all as seen" : "Set baseline"}
            </button>
          }
        >
          {!baseline ? (
            <p className="text-xs text-slate-500">
              No baseline yet. Click <strong>Set baseline</strong> to remember the calendar as it is now —
              future re-syncs will then show exactly what changed (added, removed, moved, edited).
            </p>
          ) : calendarChanges.length === 0 ? (
            <p className="text-xs text-slate-400">
              No calendar changes since {new Date(baseline.syncedAt).toLocaleString()}.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {calendarChanges.map((c) => (
                <li
                  key={`${c.kind}:${c.uid}`}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ChangeBadge kind={c.kind} />
                    <span className="font-medium">{c.summary}</span>
                    <span className="text-xs text-slate-400">{c.dayKey}</span>
                  </div>
                  {c.kind === "changed" && (
                    <ul className="mt-1 space-y-0.5 pl-1 text-xs text-slate-500">
                      {c.fields.map((f) => (
                        <li key={f.label}>
                          <span className="font-medium text-slate-600">{f.label}:</span>{" "}
                          <span className="text-rose-500 line-through">{f.from}</span> →{" "}
                          <span className="text-emerald-600">{f.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* NEW FROM CALENDAR */}
      {newItems.length > 0 && (
        <Section
          title={`New from calendar (${newItems.length})`}
          tone="sky"
          action={
            <button
              onClick={saveAllNew}
              className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-700"
            >
              Save all ({newItems.length})
            </button>
          }
        >
          <ul className="space-y-2">
            {newItems.map((item) => {
              const edit = newEdits.get(item.event.uid);
              const name = edit?.name ?? item.event.extractedName;
              const type = edit?.type ?? item.event.type;
              return (
                <li key={item.event.uid} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-medium text-slate-600">{item.event.summary}</span>
                        {item.event.dayKey && <span>{item.event.dayKey}</span>}
                        {item.event.location && <span>· {item.event.location}</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={name}
                          onChange={(e) =>
                            setNewEdits((m) => new Map(m).set(item.event.uid, { name: e.target.value, type }))
                          }
                          placeholder="Entity name"
                          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-400"
                        />
                        <TypeSelect
                          value={type}
                          onChange={(t) =>
                            setNewEdits((m) => new Map(m).set(item.event.uid, { name, type: t }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => saveNew(item.event, name, type)}
                        disabled={isSaving(item.event.uid)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        {isSaving(item.event.uid) ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => mark(item.event.uid, "skipped")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* POSSIBLE MATCHES */}
      {fuzzyItems.length > 0 && (
        <Section title={`Possible matches (${fuzzyItems.length})`} tone="amber">
          <p className="mb-3 text-xs text-slate-400">
            These calendar events partially match existing DB entities but didn't link automatically. Review each pair.
          </p>
          <ul className="space-y-2">
            {fuzzyItems.map((item) => (
              <li key={item.event.uid} className={`rounded-xl border p-3 ${item.contained ? "border-indigo-200 bg-indigo-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        {item.contained ? "Calendar (visit to known venue)" : "Calendar"}
                      </span>
                      {item.contained && (
                        <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">📍 Venue match</span>
                      )}
                    </div>
                    <div className="font-medium">{item.event.extractedName}</div>
                    <div className="text-xs text-slate-500">{item.event.type}{item.event.dayKey && ` · ${item.event.dayKey}`}</div>
                  </div>
                  <div className="text-slate-300 self-center text-lg">≈</div>
                  <div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">DB entity</span>
                    <div className="font-medium">{item.candidate.name}</div>
                    <div className="text-xs text-slate-500">{item.candidate.type}{item.candidate.generalArea && ` · ${item.candidate.generalArea}`}</div>
                  </div>
                  <div className="text-xs text-slate-400 self-end">
                    {item.contained ? "name contained in event" : `${Math.round(item.score * 100)}% word overlap`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => linkFuzzy(item.event, item.candidate.id)}
                    disabled={isSaving(item.event.uid)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${item.contained ? "bg-indigo-600 hover:bg-indigo-700" : "bg-amber-600 hover:bg-amber-700"}`}
                  >
                    {isSaving(item.event.uid) ? "…" : item.contained ? `Link — this is a visit to "${item.candidate.name}"` : `Link to "${item.candidate.name}"`}
                  </button>
                  <button
                    onClick={() => saveNew(item.event)}
                    disabled={isSaving(item.event.uid)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Save as new
                  </button>
                  <button
                    onClick={() => mark(item.event.uid, "skipped")}
                    className="text-xs text-slate-400 hover:underline"
                  >
                    Skip
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* TYPE MISMATCH */}
      {typeChangedItems.length > 0 && (
        <Section title={`Type mismatch (${typeChangedItems.length})`} tone="violet">
          <p className="mb-3 text-xs text-slate-400">
            The keyword parser inferred a different type from the calendar event title than what&apos;s stored in the DB.
            Violet rows were auto-imported from the calendar and may genuinely need fixing — use{" "}
            <strong>Update to X</strong> or <strong>Park</strong> (for logistics blocks like drives/check-ins).
            Grey rows were manually curated and are almost certainly correct — hit <strong>Dismiss</strong> to clear them.
          </p>
          <ul className="space-y-2">
            {typeChangedItems.map((item) => {
              const currentTab = ENTITY_TABS.find((t) => t.type === item.entity.type);
              const calTab = ENTITY_TABS.find((t) => t.type === item.calType);
              const isAutoImported = item.entity.calendarSource;
              return (
                <li key={item.entity.id} className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 ${isAutoImported ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.entity.name}</span>
                      {!isAutoImported && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">manually curated</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 ${isAutoImported ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>
                        DB: {currentTab?.emoji} {item.entity.type}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                        parser saw: {calTab?.emoji} {item.calType}
                      </span>
                    </div>
                    <div className="mt-1.5 rounded bg-white px-2 py-1 text-xs text-slate-500 border border-slate-200">
                      <span className="font-medium text-slate-400">Calendar event: </span>
                      {item.event.summary}
                      {item.event.location && <span className="text-slate-400"> · {item.event.location}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {/* Update is available on every row now — a curated entity can
                        have a genuinely wrong type too (e.g. Hersheypark as sight). */}
                    <button
                      onClick={() => updateType(item.entity, item.calType)}
                      disabled={isSaving(item.entity.id)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {isSaving(item.entity.id) ? "…" : `Update to ${item.calType}`}
                    </button>
                    <button
                      onClick={() => mark(item.entity.id, "kept")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {isAutoImported ? `Keep ${item.entity.type}` : "Dismiss"}
                    </button>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) parkEntity(item.entity, e.target.value as EntityType); }}
                      disabled={isSaving(item.entity.id)}
                      title="Keep this but file it as a logistics/misc bucket so the sync stops flagging it"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <option value="">Park…</option>
                      <option value="travel">✈️ Travel</option>
                      <option value="admin">📋 Admin</option>
                      <option value="uncategorised">❓ Misc</option>
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ORPHANED — genuine (added or auto-imported, but missing from calendar) */}
      {genuineOrphans.length > 0 && (
        <Section
          title={`Missing from calendar (${genuineOrphans.length})`}
          tone="rose"
          action={<BulkOrphanActions items={genuineOrphans} onKeepAll={keepAll} onRemoveAll={removeAll} />}
        >
          <p className="mb-3 text-xs text-slate-400">
            You added these to the trip (or they were auto-imported from the calendar), but no calendar event
            matches them now. They may have been removed from the calendar, or are still planned-but-not-confirmed.
          </p>
          <ul className="space-y-2">
            {genuineOrphans.map((item) => (
              <OrphanRow
                key={item.entity.id}
                item={item}
                saving={isSaving(item.entity.id)}
                onKeep={() => mark(item.entity.id, "kept")}
                onRemove={() => removeOrphaned(item.entity.id)}
              />
            ))}
          </ul>
        </Section>
      )}

      {/* CANDIDATE PLACES — in a trip area but never scheduled */}
      {candidatePlaces.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            🍴 Candidate places not yet scheduled ({candidatePlaces.length})
          </summary>
          <p className="mb-3 mt-2 text-xs text-slate-400">
            Curated options (restaurants, shops, stays…) that belong to a trip area but aren&apos;t on the
            calendar. This is normal — it&apos;s your shortlist. Keep them as options, or remove any you&apos;ve ruled out.
          </p>
          <div className="mb-3">
            <BulkOrphanActions items={candidatePlaces} onKeepAll={keepAll} onRemoveAll={removeAll} />
          </div>
          <ul className="space-y-2">
            {candidatePlaces.map((item) => (
              <OrphanRow
                key={item.entity.id}
                item={item}
                saving={isSaving(item.entity.id)}
                onKeep={() => mark(item.entity.id, "kept")}
                onRemove={() => removeOrphaned(item.entity.id)}
              />
            ))}
          </ul>
        </details>
      )}

      {/* PLAN ISSUES */}
      {planIssues.length > 0 && (
        <Section title={`Plan issues (${planIssues.length})`} tone="slate">
          <ul className="space-y-2">
            {planIssues.map((issue, i) => {
              const conf = ISSUE_STYLE[issue.severity];
              return (
                <li key={i} className={`rounded-xl border p-3 ${conf.box}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${conf.dot}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{issue.kind}</span>
                    <span className="ml-auto text-sm font-medium">{issue.entity}</span>
                    <button
                      onClick={() => setDismissedIssues([...new Set([...dismissed, issueKey(issue)])])}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{issue.detail}</p>
                </li>
              );
            })}
          </ul>
          {dismissed.length > 0 && (
            <div className="mt-2 flex justify-end">
              <button onClick={() => setDismissedIssues([])} className="text-xs text-slate-400 hover:underline">
                Restore {dismissed.length} dismissed
              </button>
            </div>
          )}
        </Section>
      )}

      {/* MATCHED — collapsed by default */}
      {matchedItems.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            ✅ {matchedItems.length} matched entities
          </summary>
          <ul className="mt-2 space-y-1">
            {matchedItems.map((item) => (
              <li key={item.entity.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-medium">{item.entity.name}</span>
                <span className="text-xs text-slate-400">{item.entity.type}</span>
                {item.entity.calendarSource && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-700">from calendar</span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {item.events.length} event{item.events.length !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* All-clear */}
      {snapshot && issueTotal === 0 && orphanedItems.length === 0 && planIssues.length === 0 && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          ✅ All clean — every calendar event is matched, no type issues, no orphaned entities.
        </p>
      )}
    </div>
  );
}

// --- sub-components ----------------------------------------------------------

const TONE_STYLES: Record<string, string> = {
  indigo: "border-indigo-200 bg-indigo-50",
  sky: "border-sky-200 bg-sky-50",
  amber: "border-amber-200 bg-amber-50",
  violet: "border-violet-200 bg-violet-50",
  rose: "border-rose-200 bg-rose-50",
  slate: "border-slate-200 bg-slate-50",
};

function Section({
  title,
  tone,
  action,
  children,
}: {
  title: string;
  tone: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`mt-4 rounded-xl border p-4 ${TONE_STYLES[tone] ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function OrphanRow({
  item,
  saving,
  onKeep,
  onRemove,
}: {
  item: Extract<SyncItem, { status: "orphaned" }>;
  saving: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex-1 text-sm">
        <span className="font-medium">{item.entity.name}</span>
        <div className="mt-0.5 text-xs text-slate-500">
          {item.entity.type}
          {item.entity.generalArea && ` · ${item.entity.generalArea}`}
          {item.entity.calendarSource && " · auto-imported"}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onKeep}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Keep
        </button>
        <button
          onClick={onRemove}
          disabled={saving}
          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          {saving ? "…" : "Remove from trip"}
        </button>
      </div>
    </li>
  );
}

function BulkOrphanActions({
  items,
  onKeepAll,
  onRemoveAll,
}: {
  items: Extract<SyncItem, { status: "orphaned" }>[];
  onKeepAll: (ids: string[]) => void;
  onRemoveAll: (ids: string[]) => void;
}) {
  const ids = items.map((i) => i.entity.id);
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onKeepAll(ids)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Keep all ({ids.length})
      </button>
      <button
        onClick={() => {
          if (confirm(`Remove all ${ids.length} from this trip? They stay in your database.`)) onRemoveAll(ids);
        }}
        className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
      >
        Remove all
      </button>
    </div>
  );
}

function ChangeBadge({ kind }: { kind: "added" | "removed" | "changed" }) {
  const map = {
    added: { label: "Added", cls: "bg-emerald-100 text-emerald-700" },
    removed: { label: "Removed", cls: "bg-rose-100 text-rose-700" },
    changed: { label: "Changed", cls: "bg-amber-100 text-amber-700" },
  } as const;
  const { label, cls } = map[kind];
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function TypeSelect({ value, onChange }: { value: EntityType; onChange: (t: EntityType) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as EntityType)}
      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
    >
      {ENTITY_TABS.map((t) => (
        <option key={t.type} value={t.type}>
          {t.emoji} {t.label}
        </option>
      ))}
    </select>
  );
}

const ISSUE_STYLE: Record<string, { dot: string; box: string }> = {
  conflict: { dot: "bg-rose-500", box: "border-rose-200 bg-rose-50" },
  warning: { dot: "bg-amber-500", box: "border-amber-200 bg-amber-50" },
  info: { dot: "bg-sky-500", box: "border-sky-200 bg-sky-50" },
};
