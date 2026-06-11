# New entities to add to the Database

These EntityIDs are referenced by `instances.csv` but **don't exist in the seed
data yet**. They came from calendar events that have no matching seed place.
Each needs a Database entry before the itinerary fully resolves. Grouped by type.

## Accommodation (4) — all new; the calendar's lodging differs from the docx
| EntityID | Name | When | Address |
| --- | --- | --- | --- |
| accommodation-bklyn-house-hotel | BKLYN House Hotel | Jun 19–23 | 9 Beaver St, Brooklyn |
| accommodation-williamstown-airbnb | Williamstown Airbnb | Jun 22–25 | 287 Luce Rd, Williamstown MA |
| accommodation-cottage-inn-grantville | Cottage Inn Grantville | Jun 24–26 | 10200 Allentown Blvd, Grantville PA |
| accommodation-hotel-1200 | Hotel 1200 | Jun 25–29 | 1200 Broadway, Brooklyn |

## Events (3)
| EntityID | Name | Note |
| --- | --- | --- |
| event-seneca-village-juneteenth | Seneca Village Juneteenth | Central Park free performance |
| event-nyc-drag-march | NYC Drag March | Tompkins → Stonewall, Fri Jun 26 |
| event-nyc-pride-march | NYC Pride March & PrideFest | Sun Jun 28 |

## Shows (3) — `shows.json` is currently empty
| EntityID | Name | Note |
| --- | --- | --- |
| show-bushwick-comedy-club | Bushwick Comedy Club | 259 Melrose St |
| show-bcc-eris-bar | BCC at Eris Bar | Plan B venue for the comedy night |
| show-joes-pub | Joe's Pub | venue; "2Scoops" drag act in the note |

## Museums (1)
| EntityID | Name | Note |
| --- | --- | --- |
| museum-moma | MoMA | Plan B for Studio Museum |

## Food (3)
| EntityID | Name | Note |
| --- | --- | --- |
| food-cornwall-coffee-co | Cornwall Coffee Co. | en-route breakfast, New Windsor |
| food-downstate-newburgh | Downstate (Newburgh) | en-route lunch |
| food-hersheypark-lunch | Hersheypark food | in-park concessions (generic) |

## Hikes (1)
| EntityID | Name | Note |
| --- | --- | --- |
| hike-cascade-falls | Cascade Falls | 4mi loop, Greylock area |

## Travel / Admin (7) — drives are their own "Drive from X to Y" slots
| EntityID | Name | Type |
| --- | --- | --- |
| travel-arrival | Arrival & Airbnb Check-In | travel |
| travel-drive-brooklyn-new-windsor | Drive: Brooklyn → New Windsor | travel |
| travel-drive-new-windsor-hudson | Drive: New Windsor → Hudson | travel |
| travel-drive-hudson-north-adams | Drive: Hudson → North Adams | travel |
| travel-drive-hershey-nyc | Drive: Hershey → NYC | travel |
| admin-pre-fist-nap-window | Pre-FIST Nap Window | admin |
| admin-crossfit | Crossfit (partner) | admin |

---

## Notes & decisions to confirm

- **`attraction-hersheypark` appears 4×** (Thu Jun 25: AM coasters, PM thrills,
  water park) — a clean demonstration of *one entity, many instances*.
- **Drives are their own slots** ("Drive from X → Y"), split out from the bundled
  calendar events. The Mon Jun 22 drive day is now: Brooklyn→New Windsor,
  New Windsor→Hudson (with Kaaterskill as a separate optional stop), Hudson→North
  Adams. Hershey→NYC on Thu Jun 25.
- **Lunch/breakfast that the calendar buried in descriptions** (e.g. the Met's
  "lunch: Central Park / Cocina Consuelo") is kept in the note rather than given
  its own slot, to stay faithful to "the calendar is right." Say the word if you
  want those promoted to real food slots.
- **MoMA** and the **basic Bushwick pizza** fallback: MoMA became a real Plan B
  entity; the un-named pizza slice stayed in a note (no entity).
- The docx's richer per-meal "Food options" lists were **not** all imported —
  only the alternatives the *calendar* preserved. We can pull more from the docx
  if you want fuller Plan B menus.
