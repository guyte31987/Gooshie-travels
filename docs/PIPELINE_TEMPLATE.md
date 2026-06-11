# Gooshie Travels — Import / Export Template Spec

**Status:** proposed (v1). This is the contract for the *new* pipeline where the
**app is the source of truth** and Google Calendar is a **one-way export**. It
replaces the old approach of parsing free-text calendar titles back into
entities (`categorizeEvent` / `matchesEntity` / `fuzzyScore`), which guessed at
meaning and was fragile.

## The model in one breath

The **Database** holds **Entities** (places — seeded once, reused across trips).
A **Trip** has a list of **Slots** — a day/time window in the itinerary (e.g.
"Friday 11pm"). Each Slot is filled by one or more **Instances**: a candidate
Entity for that window, with a **Capacity** (Confirmed / Planned / Plan B). A
slot normally has one Confirmed (or Planned) primary plus any number of Plan B
alternatives competing for it — so you can decide between competing options
right up to the day. From the Slots + Instances we render an ICS file and push
it to Google Calendar. Nothing is ever parsed back *in*.

**Slot is a first-class thing:** it owns the day/time, so the competing
instances physically cannot disagree about *when*, and "primary vs alternative"
is explicit (Capacity), not implied.

Three concerns → **three sheets**:

| Sheet | Describes | Key | Round-trips? |
| --- | --- | --- | --- |
| **Places** | *what* a place is (address, hours, website…) | `id` (EntityID) | Yes — export, enrich, re-import |
| **Slots** | *when* — a time window in the trip | `SlotID` | Export → Google Calendar |
| **Instances** | *which entity fills a slot*, and with what capacity | (`SlotID`, `EntityID`) | App; primary → Calendar |

A place is described **once** in Places. It can fill **many** slots across the
trip (a stay over several nights, a bar before *and* after a show). One Slot →
one or more Instances. One Entity → many Instances.

---

## Sheet 1 — Places (entities)

This is the existing entity CSV and already round-trips well. Hand it to Gemini
to fill addresses / coordinates / hours / websites, then re-import: objective
facts overwrite, `Notes` is only filled when blank (manual curation is never
clobbered). Identity (`id`, `Name`, `Type`) is **never** changed by an import.

**Columns** (header row exactly as written; matching on `id`):

| Column | Meaning | Import behaviour |
| --- | --- | --- |
| `id` | Stable EntityID — `type-slug`, e.g. `food-deans`, `club-basement` | Match key. Required. Never created/renamed on import. |
| `Name` | Display name | Ignored on import (identity) |
| `Type` | One of the entity types (see below) | Ignored on import (identity) |
| `Region` | General area, e.g. `New York City`, `Berkshires` | Overwrite |
| `Area` | Neighbourhood, e.g. `Bushwick` | Overwrite |
| `Address` | Street address | Overwrite |
| `Lat` | Decimal latitude | Overwrite (numeric) |
| `Lng` | Decimal longitude | Overwrite (numeric) |
| `Website` | Primary URL | Overwrite |
| `Instagram` | Profile URL or `@handle` | Overwrite |
| `Hours` | Opening hours, free text | Overwrite |
| `Price` | `$`–`$$$$` or a range | Overwrite |
| `Booking` | How to book | Overwrite |
| `Closed` | `CLOSED` if permanently shut, else blank | (read-only export) |
| `Notes` | Curation / why it's worth it | **Fill only if blank** |

**EntityID format:** `slugId(type, name)` — lowercase the name, `&` → `and`,
any run of non-alphanumerics → `-`, trim leading/trailing `-`, cap at 60 chars,
prefix with `type-`. Examples: `Dean's` + food → `food-deans`; `Basement` +
club → `club-basement`.

**Entity types:** `food`, `vintage`, `museum`, `club`, `bar`, `spa`, `sight`,
`attraction`, `hike`, `show`, `event`, `accommodation`, `travel`, `admin`,
`uncategorised`. (`party` is a legacy synonym for `club`; don't emit it for new
data.)

**Placeholders:** if a value is genuinely unknown, leave the cell **blank**.
Do not write `N/A`, `unknown`, `TBD`, `-`, etc. — those are flagged and ignored,
which just adds noise.

### Example (Places)

```csv
id,Name,Type,Region,Area,Address,Lat,Lng,Website,Instagram,Hours,Price,Booking,Closed,Notes
club-basement,Basement,club,New York City,Bushwick,1133 Flushing Ave,40.706,-73.923,,@basement.nyc,Fri–Sun 11pm–late,$$$,Resident Advisor,,Dark techno; FIST hosts here
food-deans,Dean's,food,New York City,Bushwick,,,,,,Daily 5pm–11pm,$$,Walk-in,,
```

---

## Sheet 2 — Slots (time windows)

A Slot is one window in the itinerary. It owns the day and time; nothing else
does. **One row = one Slot.**

| Column | Meaning | Required | Notes |
| --- | --- | --- | --- |
| `SlotID` | Stable id for the window, e.g. `fri-night`, `sat-museum` | ✓ | Referenced by the Instances sheet. Keep it short and human. |
| `Day` | Date `YYYY-MM-DD` | ✓ | Trip day. |
| `Start` | Start time `HH:MM` (24h, trip-local tz) | – | Blank = all-day / flexible. |
| `End` | End time `HH:MM` | – | Blank → default duration applied on export. |
| `Label` | Optional human label, e.g. `Friday night out` | – | For the app's slot header. |

### Example (Slots)

```csv
SlotID,Day,Start,End,Label
sun-checkin,2026-06-18,,,Arrival
fri-dinner,2026-06-19,19:00,20:30,Birthday dinner
fri-night,2026-06-19,23:00,,Friday night out
sat-cloisters,2026-06-20,11:00,13:00,Met Cloisters morning
```

---

## Sheet 3 — Instances (entity ↔ slot)

Which entity fills which slot, and with what capacity. **One row = one
Instance.** Deterministic: every row references an existing `SlotID` *and*
`EntityID`, so there is no name-matching or time-matching guess anywhere.

| Column | Meaning | Required | Notes |
| --- | --- | --- | --- |
| `SlotID` | Which window — must exist in Slots | ✓ | Join key. |
| `EntityID` | Which place — must exist in Places / the Database | ✓ | Join key. Unknown → flagged, never invented. |
| `Capacity` | `confirmed` \| `planned` \| `planB` | ✓ | See below. |
| `Note` | Per-occurrence note for this visit | – | Distinct from the place's general `Notes`. |

**Capacity** (what the Instance *is*):

- `confirmed` — committed for that slot. Exported to Google Calendar as a normal
  (busy) event.
- `planned` — intended but not locked. Exported to Google Calendar as a
  **`TENTATIVE`** event so it still shows up (faded/hatched) — you see the whole
  trip at a glance.
- `planB` — an alternative competing for the slot. Lives in the app under its
  slot so you can decide between competing options; **not** exported.

**One slot, competing options:** a slot has at most one `confirmed`/`planned`
primary (the one that exports) plus any number of `planB` rows. To say "Friday
night is Basement, but if that falls through it's 3 Dollar Bill or Nowadays,"
add three Instances on slot `fri-night`: one primary + two `planB`.

### Example (Instances)

```csv
SlotID,EntityID,Capacity,Note
sun-checkin,stay-the-box-house-hotel,confirmed,Check-in 3pm
fri-dinner,food-deans,confirmed,Birthday dinner — book the back table
fri-night,club-basement,confirmed,FIST 10-yr
fri-night,club-3-dollar-bill,planB,If FIST sells out
fri-night,club-nowadays,planB,Backup #2
sat-cloisters,museum-the-met-cloisters,planned,Pair with Fort Tryon walk
```

`fri-night` has a confirmed primary and two Plan B alternatives. `sat-cloisters`
is planned → exports as tentative.

---

## Export to Google Calendar

Slots + Instances → ICS. One VEVENT per **confirmed** or **planned** primary
Instance (Plan B never exports):

- **UID** — stable, derived from `tripId + SlotID + EntityID` so re-exports
  update the same event rather than duplicating.
- **STATUS** — `CONFIRMED` for confirmed, `TENTATIVE` for planned (so planned
  items still render, visibly distinct).
- **SUMMARY** — a fixed, machine-clean format: just `{Entity Name}` — no verbs,
  no "or", no decoration. The whole reason the old parser hurt was free-text
  titles; we now own this format, so keep it plain.
- **DTSTART / DTEND** — from the Slot's `Day` + `Start` / `End` (all-day when
  `Start` blank).
- **LOCATION** — the entity's `Address`.
- **DESCRIPTION** — the Instance `Note` (+ a link back to the app card).

Because we generate every field, the calendar is lossless and never needs to be
read back.

> **Colour note:** per-event colour can't be set via an ICS import (Google
> ignores it). `TENTATIVE` status is what visually separates planned from
> confirmed. If you later want true colour separation, the move is a second
> calendar feed for tentative items — not something ICS can do per-event.

---

## Why seeding stays

The seed defines the **vocabulary of valid EntityIDs**. The Itinerary sheet only
ever *references* that vocabulary — it never invents places. That's what makes
import deterministic: Gemini/Claude filling the Itinerary picks from a known list
instead of typing a name we then have to fuzzy-match. Seed once, schedule freely.

---

## Decisions (resolved)

1. **Calendar is one-way.** The app is the source of truth; we export to Google
   Calendar and never parse it back. Once migrated, the calendar parser
   (`lib/sync.ts`, `lib/calendar-diff.ts`, and the matching half of
   `lib/entities.ts`) is retired.
2. **`planned` Instances export as `TENTATIVE`** so the whole trip is visible on
   the calendar, faded/distinct from confirmed. `planB` stays app-only.
3. **Slots are first-class.** A Slot owns day/time; Instances reference it by
   `SlotID`. This lets competing options share a window without disagreeing on
   *when*, and makes primary-vs-alternative explicit.
</content>
