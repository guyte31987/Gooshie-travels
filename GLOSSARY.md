# Gooshie Travels — Glossary

One shared vocabulary for the app. These are the canonical names; code and UI
should use them consistently.

| Term | What it means |
| --- | --- |
| **Trip** | A single travel (e.g. *NYC Pride & Berkshires 2026*). Has dates and one or more Regions, plus its own Google Calendar. |
| **Database** | The master catalog of **all Entities**, across every trip. Editable by admins + editors. |
| **Entity** (a.k.a. *Place*) | A thing that exists independent of any trip — a restaurant, museum, party, hike, shop, or stay. Holds attributes (name, hours, address, price, region…). Reused across trips. |
| **Region** (a.k.a. *General Area*) | The broad geographic grouping of an Entity: *New York City*, *Upstate New York*, *Berkshires*, *Pennsylvania*… A trip's Planning is seeded by matching Region. |
| **Calendar Event** | A raw event from a trip's Google Calendar, identified by a stable **UID**. The schedule source of truth (until an Instance is Locked). |
| **Instance** (a.k.a. *Appearance* / *Visit*) | **One occurrence** of an Entity within a Trip, at a day/time. Links Entity ↔ Trip ↔ Calendar Event (UID). Owns its **comments + photos**, app-notes, and Lock state. The itinerary item and the entity card both point to the *same* Instance. |
| **Capacity** (a.k.a. *Kind*) | What an Instance is: **Confirmed** (scheduled on the calendar), **Planned** (intended), or **Plan B** (an alternative). |
| **Membership** | Whether an Entity is included in a Trip's Planning. Default = its Region is one of the trip's Regions; you can manually **remove** or **add** (stored as deltas). |
| **Lock** | A flag on an Instance meaning *"app-owned — don't re-sync this from the calendar."* A locked Instance keeps its app data, can be edited/removed, and survives even if the Calendar Event is deleted. |
| **Sync / Re-sync** | Pulling the trip's calendar and refreshing Instances — respecting Locks. Automatic on load + daily; "Re-sync now" forces it. |
| **Sync Report / Conflicts** | The admin view of unresolved items: plan-vs-calendar mismatches, closed venues in the plan, unmappable locations, uncategorized events. Each can be dismissed. |
| **Comment** | A text note on an Instance. **Media** = photos/video on an Instance (Phase 3). |

## Relationships, in one line
**Database** holds **Entities**. A **Trip** includes some Entities (**Membership**),
each appearing as one or more **Instances** (with a **Capacity** and a time),
anchored to **Calendar Events** by UID — unless **Locked**, after which the app
owns them. **Comments** and **Media** hang off Instances.
