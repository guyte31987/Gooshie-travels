// Diffs two calendar snapshots (previous "baseline" vs a fresh pull) by event UID
// so the admin can see exactly what a calendar edit did: events added, removed,
// or changed (moved day/time, renamed, relocated, notes edited).

import type { ItinDay, ItinEvent } from "./entities";

export type ChangedField = { label: string; from: string; to: string };

export type CalendarChange =
  | { kind: "added"; uid: string; summary: string; dayKey: string }
  | { kind: "removed"; uid: string; summary: string; dayKey: string }
  | { kind: "changed"; uid: string; summary: string; dayKey: string; fields: ChangedField[] };

type Located = { e: ItinEvent; dayKey: string };

function flatten(days: ItinDay[]): Map<string, Located> {
  const m = new Map<string, Located>();
  for (const d of days) for (const e of d.events) m.set(e.uid, { e, dayKey: d.dayKey });
  return m;
}

/** Human-readable clock label for an event, in the calendar's timezone. */
function timeLabel(e: ItinEvent, tz: string): string {
  if (e.isAllDay) return "all-day";
  if (typeof e.startMs !== "number") return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(e.startMs));
  } catch {
    return new Date(e.startMs).toISOString().slice(11, 16);
  }
}

const trunc = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Compare a baseline calendar to the latest pull. Returns added / removed /
 * changed events. Order: added first, then changed, then removed.
 */
export function diffCalendars(prev: ItinDay[], next: ItinDay[], tz: string): CalendarChange[] {
  const before = flatten(prev);
  const after = flatten(next);
  const added: CalendarChange[] = [];
  const changed: CalendarChange[] = [];
  const removed: CalendarChange[] = [];

  for (const [uid, cur] of after) {
    const old = before.get(uid);
    if (!old) {
      added.push({ kind: "added", uid, summary: cur.e.summary, dayKey: cur.dayKey });
      continue;
    }
    const fields: ChangedField[] = [];
    if (old.e.summary !== cur.e.summary)
      fields.push({ label: "Title", from: old.e.summary, to: cur.e.summary });
    if (old.dayKey !== cur.dayKey) fields.push({ label: "Day", from: old.dayKey, to: cur.dayKey });
    if (timeLabel(old.e, tz) !== timeLabel(cur.e, tz))
      fields.push({ label: "Time", from: timeLabel(old.e, tz), to: timeLabel(cur.e, tz) });
    if ((old.e.location ?? "") !== (cur.e.location ?? ""))
      fields.push({ label: "Location", from: old.e.location ?? "—", to: cur.e.location ?? "—" });
    if ((old.e.description ?? "") !== (cur.e.description ?? ""))
      fields.push({
        label: "Notes",
        from: trunc(old.e.description ?? "—"),
        to: trunc(cur.e.description ?? "—"),
      });
    if (fields.length)
      changed.push({ kind: "changed", uid, summary: cur.e.summary, dayKey: cur.dayKey, fields });
  }

  for (const [uid, old] of before) {
    if (!after.has(uid))
      removed.push({ kind: "removed", uid, summary: old.e.summary, dayKey: old.dayKey });
  }

  return [...added, ...changed, ...removed];
}
