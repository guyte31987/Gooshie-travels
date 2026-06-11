# Migration sample — Friday June 19

A worked example of one day mapped from the **calendar** (master) into the new
three-sheet model, with how it exports and how it renders in the app. The full
trip is in `slots.csv` + `instances.csv`; entities that don't yet exist in the
seed Database are listed in `new-entities.md`.

Rules confirmed for this migration:

- **Calendar is master.** Plan B alternatives are recovered from the calendar's
  own description text (the "or …", "Fallback: …", "Plan B: …" prose).
- **Trip timezone = `America/New_York`.** The clock times shown in the calendar
  are the intended NYC wall-clock (e.g. FIST = 11pm).
- **One Entity per real thing.** Museum = the museum (exhibition → note). Parties
  live inside their club (`parentId`). Events stand alone.
- A **slot = one Instance** = a clickable, expandable entity card (details +
  note + comments/photos).
- **Export** carries **title + date/time + location + note**. Only `confirmed`
  and `planned` export; `planB` stays in the app.
- **MOS** items = the partner's "maybe" picks → `planned` / `planB`.

## Slots (Fri Jun 19)

| SlotID | Start | End | Label |
| --- | --- | --- | --- |
| fri19-met | 10:00 | 13:00 | Met morning |
| fri19-seneca | 13:30 | 14:00 | Seneca Village |
| fri19-studio | 14:00 | 17:00 | Studio Museum |
| fri19-dinner | 18:00 | 20:00 | Pre-FIST dinner |
| fri19-nap | 20:00 | 22:30 | Pre-FIST nap |
| fri19-fist | 23:00 | – | FIST anniversary |

## Instances (Fri Jun 19)

| Slot | Entity | Capacity | Note |
| --- | --- | --- | --- |
| fri19-met | museum-met-fifth-avenue | confirmed | Costume Art exhibition; lunch Central Park / Cocina Consuelo |
| fri19-seneca | event-seneca-village-juneteenth | planned | Free outdoor performance; optional |
| fri19-studio | museum-studio-museum-in-harlem | confirmed | New Adjaye building; Juneteenth hours 11–8 |
| fri19-studio | museum-moma | planB | If Harlem too far |
| fri19-dinner | food-deans | confirmed | DINNER LOCKED; Resy or walk-in bar |
| fri19-dinner | food-la-cantine | planB | Fallback if Dean's full |
| fri19-nap | admin-pre-fist-nap-window | confirmed | Train home, rest |
| fri19-fist | party-fist | confirmed | FIST 10-Year @ Basement; URGENT |

## How it exports (ICS)

`confirmed` + `planned` only; `planB` (MoMA, La Cantine) never ships. `planned`
gets a `[Plan]` title prefix + `STATUS:TENTATIVE` so you can colour it by hand.

```ics
BEGIN:VEVENT
UID:nytrip-fri19-met-museum-met-fifth-avenue@gooshie
DTSTART;TZID=America/New_York:20260619T100000
DTEND;TZID=America/New_York:20260619T130000
SUMMARY:Met Fifth Avenue
LOCATION:1000 5th Ave, New York, NY
DESCRIPTION:Costume Art exhibition (Condé Nast Galleries). Lunch: Central
  Park picnic or Cocina Consuelo.
STATUS:CONFIRMED
END:VEVENT

BEGIN:VEVENT
UID:nytrip-fri19-seneca-event-seneca-village-juneteenth@gooshie
DTSTART;TZID=America/New_York:20260619T133000
DTEND;TZID=America/New_York:20260619T140000
SUMMARY:[Plan] Seneca Village Juneteenth
LOCATION:Seneca Village, Central Park, NY
DESCRIPTION:Free outdoor performance 82nd–89th CPW. Optional 20-min stop.
STATUS:TENTATIVE
END:VEVENT

BEGIN:VEVENT
UID:nytrip-fri19-fist-party-fist@gooshie
DTSTART;TZID=America/New_York:20260619T230000
SUMMARY:FIST
LOCATION:Basement NY, 29 Wyckoff Ave, Queens, NY
DESCRIPTION:FIST 10-Year. DJ T-1000 / Word of Command / Sevyn 0000 / DJ Clone.
STATUS:CONFIRMED
END:VEVENT
```

`party-fist`'s `LOCATION` is inherited from its parent club (Basement).

## How it looks in the app

Trip calendar — each row is a clickable Instance:

```
┌─ Fri Jun 19 ──────────────────────────── 🛏 BKLYN House Hotel ─┐
│ 10:00  🖼  Met Fifth Avenue                        [confirmed] │
│  1:30  🎫  Seneca Village Juneteenth   [planned · partner]    │
│  2:00  🖼  Studio Museum in Harlem                 [confirmed] │
│           └ Plan B: MoMA                              ⇄ swap   │
│  6:00  🍴  Dean's                                  [confirmed] │
│           └ Plan B: La Cantine                       ⇄ swap   │
│  8:00  📋  Pre-FIST Nap Window                     [confirmed] │
│ 11:00  🎶  FIST  · at Basement                     [confirmed] │
└───────────────────────────────────────────────────────────────┘
```

Expanded slot (tap Dean's):

```
┌ 6:00 PM · Pre-FIST dinner ────────────────────────────────────┐
│ 🍴 Dean's                                  food · SoHo, NYC    │
│ 213 6th Ave · $$ · Opens 4pm · Resy or walk-in bar            │
│ Note: DINNER — LOCKED. Oysters / langoustines / Guinness.    │
│ 💬 2 comments   📷 1 photo                                     │
│ Competing options:  ● Dean's (main)   ○ La Cantine [make main⇄]│
└───────────────────────────────────────────────────────────────┘
```

"Make main" swaps capacities (La Cantine → confirmed, Dean's → planB) and the
next export follows. The Dean's card is shared with the **General DB** (all
trips' instances stacked); the **Trip DB** shows just this trip's instance.
