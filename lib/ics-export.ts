// One-way export: turn the app's Slots + Instances into an ICS calendar feed.
// This is the *new* pipeline's output — the app owns the schedule and renders a
// clean, lossless calendar that never needs to be parsed back in.
//
// Rules (see docs/PIPELINE_TEMPLATE.md):
//  • one VEVENT per slot's MAIN instance (confirmed or planned); Plan B has no
//    event of its own but its name is listed in the main event's DESCRIPTION
//  • confirmed → STATUS:CONFIRMED, planned → STATUS:TENTATIVE + "[Plan] " title prefix
//  • SUMMARY = entity name (or the slot label for trip-local logistics)
//  • LOCATION = entity address (or name + area); parties inherit their club's address
//  • DESCRIPTION = the instance note + "Plan B options: …" when alternatives exist
//  • multi-day stays export as all-day transparent events

export type IcsEntity = { name: string; type: string; area?: string; parent?: string; address?: string };
export type IcsSlot = { id: string; day: string; start: number; end: number; label: string };
export type IcsInstance = { slotId: string; entityId: string; capacity: "confirmed" | "planned" | "planB"; note?: string };
export type IcsStay = { name: string; from: string; to: string; address?: string };

const TZ_BLOCK = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Add minutes to a YYYY-MM-DD day, rolling past midnight. Returns local stamp YYYYMMDDTHHMMSS. */
function localStamp(day: string, minutes: number): string {
  let [y, m, d] = day.split("-").map(Number);
  let mins = minutes;
  while (mins >= 1440) { mins -= 1440; const dt = new Date(Date.UTC(y, m - 1, d + 1)); y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate(); }
  return `${y}${pad(m)}${pad(d)}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`;
}
const dateStamp = (day: string) => day.replace(/-/g, "");

function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC5545 line folding at 73 chars (conservative; Google is lenient). */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) { out.push(" " + rest.slice(0, 72)); rest = rest.slice(72); }
  return out.join("\r\n");
}

function mainInstance(slotId: string, instances: IcsInstance[]): IcsInstance | undefined {
  const all = instances.filter((i) => i.slotId === slotId);
  return all.find((i) => i.capacity !== "planB");
}

/** Plan B entity names for a slot, in array order. */
function altNames(slotId: string, instances: IcsInstance[], entities: Map<string, IcsEntity>): string[] {
  return instances
    .filter((i) => i.slotId === slotId && i.capacity === "planB")
    .map((i) => entities.get(i.entityId)?.name)
    .filter((n): n is string => !!n);
}

export function buildTripIcs(opts: {
  calName: string;
  slots: IcsSlot[];
  instances: IcsInstance[];
  entities: Map<string, IcsEntity>;
  stays?: IcsStay[];
}): string {
  const { calName, slots, instances, entities, stays = [] } = opts;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Gooshie Travels//Itinerary//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:America/New_York",
    ...TZ_BLOCK,
  ];

  for (const slot of slots) {
    const main = mainInstance(slot.id, instances);
    if (!main || main.capacity === "planB") continue;
    const ent = entities.get(main.entityId);
    const planned = main.capacity === "planned";
    const title = (planned ? "[Plan] " : "") + (ent?.name ?? slot.label);
    const location = ent?.address || (ent ? `${ent.name}${ent.area ? ", " + ent.area : ""}` : "");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:nytrip-${slot.id}-${main.entityId}@gooshie`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
    lines.push(fold(`SUMMARY:${esc(title)}`));
    lines.push(`DTSTART;TZID=America/New_York:${localStamp(slot.day, slot.start)}`);
    const endMin = slot.end > slot.start ? slot.end : slot.start + 90;
    lines.push(`DTEND;TZID=America/New_York:${localStamp(slot.day, endMin)}`);
    if (location) lines.push(fold(`LOCATION:${esc(location)}`));
    const alts = altNames(slot.id, instances, entities);
    const description = [main.note, alts.length ? `Plan B options: ${alts.join(", ")}` : ""]
      .filter(Boolean)
      .join("\n\n");
    if (description) lines.push(fold(`DESCRIPTION:${esc(description)}`));
    lines.push(`STATUS:${planned ? "TENTATIVE" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }

  for (const stay of stays) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:nytrip-stay-${dateStamp(stay.from)}-${esc(stay.name).replace(/\W+/g, "")}@gooshie`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
    lines.push(fold(`SUMMARY:🛏 ${esc(stay.name)}`));
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(stay.from)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(stay.to)}`);
    if (stay.address) lines.push(fold(`LOCATION:${esc(stay.address)}`));
    lines.push("TRANSP:TRANSPARENT");
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Trigger a browser download of an ICS string. */
export function downloadIcs(ics: string, filename: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
