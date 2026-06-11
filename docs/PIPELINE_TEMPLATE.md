# Gooshie Travels — Import / Export Template Spec

**Status:** proposed (v1). This is the contract for the *new* pipeline where the
**app is the source of truth** and Google Calendar is a **one-way export**. It
replaces the old approach of parsing free-text calendar titles back into
entities (`categorizeEvent` / `matchesEntity` / `fuzzyScore`), which guessed at
meaning and was fragile.

## The model in one breath

The **Database** holds **Entities** (places — seeded once, reused across trips).
A **Trip** schedules some of those entities as **Instances**: one Instance =
one occurrence of one Entity at one day/time, with a **Capacity**
(Confirmed / Planned / Plan B). The itinerary is just a list of Instances. From
that list we render an ICS file and push it to Google Calendar. Nothing is ever
parsed back *in*.

Two separate concerns → **two separate sheets**:

| Sheet | Describes | Key | Round-trips? |
| --- | --- | --- | --- |
| **Places** | *what* a place is (address, hours, website…) | `id` (EntityID) | Yes — export, enrich, re-import |
| **Itinerary** | *when* a place is scheduled in a trip | `EntityID` (reference) | Export only → Google Calendar |

A place is described **once** in Places. It can be scheduled **many times** in
Itinerary (a stay over several nights, a bar before *and* after a show). One
Entity → many Instances. Each Instance sits in exactly one time slot.

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

## Sheet 2 — Itinerary (instances)

The new, rigid schedule template. **One row = one Instance.** Deterministic:
every row references an existing `EntityID`, so there is no name-matching guess.
This is the sheet that becomes the Google Calendar.

**Columns:**

| Column | Meaning | Required | Notes |
| --- | --- | --- | --- |
| `EntityID` | Which place — must exist in Places / the Database | ✓ | The join key. If it doesn't exist, the row is flagged, not invented. |
| `Day` | Date `YYYY-MM-DD` | ✓ | The trip day this occurs on. |
| `Start` | Start time `HH:MM` (24h, trip-local tz) | – | Blank = all-day / flexible. |
| `End` | End time `HH:MM` | – | Blank → default duration applied on export. |
| `Capacity` | `confirmed` \| `planned` \| `planB` | ✓ | See below. |
| `PlanBGroup` | Label tying alternatives to one slot, e.g. `fri-night` | – | Only for `planB` (and the `confirmed`/`planned` row it competes with). Blank otherwise. |
| `Note` | Per-occurrence note for this visit | – | Distinct from the place's general `Notes`. |

**Capacity** (what the Instance *is*):

- `confirmed` — locked into the schedule; **this is what gets exported to Google
  Calendar.**
- `planned` — intended but not yet committed. Stays in the app; **not** exported
  (or exported as tentative — see open question).
- `planB` — an alternative for a slot. Lives in the app next to its primary;
  **not** exported. Linked to the primary via `PlanBGroup`.

**Plan B semantics:** to say "Friday night is Basement, but if that falls
through it's 3 Dollar Bill or Nowadays," write three rows that share
`PlanBGroup = fri-night`: one `confirmed`/`planned` (the primary) and two
`planB`. The app shows them stacked under that slot; only the primary exports.

### Example (Itinerary)

```csv
EntityID,Day,Start,End,Capacity,PlanBGroup,Note
stay-the-box-house-hotel,2026-06-18,,,confirmed,,Check-in 3pm
food-deans,2026-06-19,19:00,20:30,confirmed,,Birthday dinner — book the back table
club-basement,2026-06-19,23:00,,confirmed,fri-night,FIST 10-yr
club-3-dollar-bill,2026-06-19,23:00,,planB,fri-night,If FIST sells out
club-nowadays,2026-06-19,23:00,,planB,fri-night,Backup #2
museum-the-met-cloisters,2026-06-20,11:00,13:00,planned,,Pair with Fort Tryon walk
```

Row 1: an all-day stay (no time). Rows 3–5: one Friday-night slot with a primary
and two Plan B alternatives. Row 6: a planned (not yet confirmed) museum visit.

---

## Export to Google Calendar

The Itinerary sheet → ICS, one VEVENT per **confirmed** Instance:

- **UID** — stable, derived from `tripId + EntityID + Day + Start` so re-exports
  update the same event rather than duplicating.
- **SUMMARY** — a fixed, machine-clean format (proposed):
  `{Entity Name}` — no verbs, no "or", no decoration. The whole reason the old
  parser hurt was free-text titles; we now own this format, so keep it plain.
- **DTSTART / DTEND** — from `Day` + `Start` / `End` (all-day when `Start` blank).
- **LOCATION** — the entity's `Address`.
- **DESCRIPTION** — the Instance `Note` (+ a link back to the app card).

Because we generate every field, the calendar is lossless and never needs to be
read back.

---

## Why seeding stays

The seed defines the **vocabulary of valid EntityIDs**. The Itinerary sheet only
ever *references* that vocabulary — it never invents places. That's what makes
import deterministic: Gemini/Claude filling the Itinerary picks from a known list
instead of typing a name we then have to fuzzy-match. Seed once, schedule freely.

---

## Open questions (decide before building)

1. **Calendar one-way?** Recommended: yes — delete the calendar parser
   (`lib/sync.ts`, `lib/calendar-diff.ts`, the matching half of
   `lib/entities.ts`) once migrated. If you want a "I tweaked a time on my phone"
   hatch, we keep a thin importer instead.
2. **Do `planned` Instances export** (as tentative VEVENTs) or stay app-only?
   Recommended: app-only; only `confirmed` reaches the calendar.
3. **Plan B linking** — is the lightweight `PlanBGroup` label enough, or do we
   want a first-class slot id in the data model? Recommended: start with the
   label; promote it only if it gets awkward.
</content>
