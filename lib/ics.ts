// Minimal, dependency-free iCalendar (.ics) parser tailored to Google Calendar
// exports. Handles line unfolding, escaped text, UTC timestamps and all-day
// (VALUE=DATE) events. All timed events are normalized to an absolute instant
// (ms since epoch); display-side code formats them in the trip timezone.

// Fallback only. The real display timezone is read from the calendar's own
// X-WR-TIMEZONE so we render the wall-clock times exactly as they were typed
// (e.g. a London-based calendar planning an NYC trip keeps "10:00 AM" as 10 AM,
// rather than shifting it by the NY offset).
export const DEFAULT_TIMEZONE = "Europe/London";

export function parseCalendarTimezone(raw: string): string {
  const m = raw.match(/X-WR-TIMEZONE:(.+)/);
  return m ? m[1].trim() : DEFAULT_TIMEZONE;
}

export type TripEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  /** Absolute start instant in ms (for timed events). */
  startMs?: number;
  endMs?: number;
  /** For all-day events: YYYY-MM-DD (start) and exclusive end date. */
  allDayStart?: string;
  allDayEnd?: string;
  isAllDay: boolean;
};

type RawProp = { value: string; params: Record<string, string> };

function unfold(raw: string): string[] {
  // RFC5545: a CRLF followed by a space or tab is a continuation.
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line: string): { key: string; prop: RawProp } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = left.split(";");
  const key = segs[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf("=");
    if (eq !== -1) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1);
  }
  return { key, prop: { value, params } };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parse a UTC timestamp like 20260619T090000Z to ms.
function parseUtc(v: string): number | undefined {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

// Parse a date-only value like 20260624 to YYYY-MM-DD.
function parseDate(v: string): string | undefined {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function parseIcs(raw: string): TripEvent[] {
  const lines = unfold(raw);
  const events: TripEvent[] = [];
  let cur: Partial<TripEvent> & { _props?: Record<string, RawProp> } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { isAllDay: false };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.summary) events.push(cur as TripEvent);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { key, prop } = parsed;
    switch (key) {
      case "UID":
        cur.uid = prop.value;
        break;
      case "SUMMARY":
        cur.summary = unescapeText(prop.value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(prop.value);
        break;
      case "LOCATION":
        cur.location = unescapeText(prop.value);
        break;
      case "DTSTART":
        if (prop.params.VALUE === "DATE") {
          cur.isAllDay = true;
          cur.allDayStart = parseDate(prop.value);
        } else {
          cur.startMs = parseUtc(prop.value);
        }
        break;
      case "DTEND":
        if (prop.params.VALUE === "DATE") {
          cur.allDayEnd = parseDate(prop.value);
        } else {
          cur.endMs = parseUtc(prop.value);
        }
        break;
    }
  }
  return events;
}

// --- Timezone-aware day bucketing -----------------------------------------

// Cache Intl formatters per timezone — constructing them is relatively costly.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(opts.weekday ? "en-US" : "en-CA", { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** YYYY-MM-DD for an absolute instant, in the given timezone. */
export function dayKeyFromMs(ms: number, tz: string): string {
  return fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

export function timeLabel(ms: number, tz: string): string {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

/** Human heading for a YYYY-MM-DD day key (rendered at noon UTC to stay on-day). */
export function dayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return fmt("UTC", { weekday: "long", month: "long", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  );
}

export type ScheduleDay = {
  dayKey: string;
  heading: string;
  events: TripEvent[];
  /** Multi-day all-day stays active on this day (accommodation band). */
  basedIn: TripEvent[];
};

function eachDateInRange(startKey: string, endKeyExclusive: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKeyExclusive.split("-").map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  while (cursor < end) {
    const dt = new Date(cursor);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
      dt.getUTCDate()
    ).padStart(2, "0")}`;
    out.push(key);
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

/**
 * Heuristic: an all-day event spanning 2+ nights is "accommodation / based-in"
 * context (hotels, Airbnbs) rather than a single-day activity.
 */
function isStay(e: TripEvent): boolean {
  if (!e.isAllDay || !e.allDayStart) return false;
  if (!e.allDayEnd) return false;
  return e.allDayEnd > e.allDayStart;
}

export function buildSchedule(events: TripEvent[], tz: string): ScheduleDay[] {
  const dayMap = new Map<string, ScheduleDay>();
  const ensure = (dayKey: string): ScheduleDay => {
    let day = dayMap.get(dayKey);
    if (!day) {
      day = { dayKey, heading: dayHeading(dayKey), events: [], basedIn: [] };
      dayMap.set(dayKey, day);
    }
    return day;
  };

  const stays: TripEvent[] = [];
  for (const e of events) {
    if (isStay(e)) {
      stays.push(e);
      continue;
    }
    if (e.isAllDay && e.allDayStart) {
      ensure(e.allDayStart).events.push(e);
    } else if (typeof e.startMs === "number") {
      ensure(dayKeyFromMs(e.startMs, tz)).events.push(e);
    }
  }

  // Spread each stay across the nights it covers.
  for (const stay of stays) {
    for (const key of eachDateInRange(stay.allDayStart!, stay.allDayEnd!)) {
      ensure(key).basedIn.push(stay);
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  for (const day of days) {
    day.events.sort((a, b) => {
      const am = a.startMs ?? -Infinity; // all-day first
      const bm = b.startMs ?? -Infinity;
      return am - bm;
    });
  }
  return days;
}
