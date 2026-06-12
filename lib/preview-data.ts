// Self-contained sample data for the itinerary-grid PROTOTYPE (the /preview page).
// Mirrors docs/migration/{slots,instances}.csv but enriched with entity display
// info (name, area, parent) so the grid can render nicely without Firestore.
// Nothing here touches the real trip — it's a throwaway fixture for design.

import type { EntityType } from "./entities";

export type PreviewEntity = {
  id: string;
  name: string;
  type: EntityType;
  area?: string;
  /** Parent venue name, for parties shown "at <club>". */
  parent?: string;
  address?: string;
  website?: string;
  instagram?: string;
  phone?: string;
  hours?: string;
};

export type Capacity = "confirmed" | "planned" | "planB";

export type PreviewInstance = {
  slotId: string;
  entityId: string;
  capacity: Capacity;
  note?: string;
  /** Per-occurrence booking state (a few are seeded for the prototype). */
  needsBooking?: boolean;
  booked?: boolean;
};

export type PreviewSlot = {
  id: string;
  day: string; // YYYY-MM-DD
  start: string; // HH:MM
  end?: string; // HH:MM (blank → default duration)
  label: string;
};

/** Where the trip is based each night (drawn as a day banner, not a block). */
export type PreviewStay = { name: string; from: string; to: string };

export const TRIP_TZ = "America/New_York";
export const TRIP_DAYS = [
  "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22", "2026-06-23",
  "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28",
];

export const PREVIEW_STAYS: PreviewStay[] = [
  { name: "BKLYN House Hotel", from: "2026-06-19", to: "2026-06-23" },
  { name: "Williamstown Airbnb", from: "2026-06-22", to: "2026-06-25" },
  { name: "Cottage Inn, Grantville", from: "2026-06-24", to: "2026-06-26" },
  { name: "Hotel 1200", from: "2026-06-25", to: "2026-06-29" },
];

const E = (id: string, name: string, type: EntityType, area?: string, parent?: string): PreviewEntity =>
  ({ id, name, type, area, parent });

export const PREVIEW_ENTITIES: PreviewEntity[] = [
  E("travel-arrival", "Arrival & Check-in", "travel"),
  E("museum-met-fifth-avenue", "Met Fifth Avenue", "museum", "Upper East Side"),
  E("event-seneca-village-juneteenth", "Seneca Village Juneteenth", "event", "Central Park"),
  E("museum-studio-museum-in-harlem", "Studio Museum in Harlem", "museum", "Harlem"),
  E("museum-moma", "MoMA", "museum", "Midtown"),
  E("food-deans", "Dean's", "food", "SoHo"),
  E("food-la-cantine", "La Cantine", "food", "Bushwick"),
  E("admin-pre-fist-nap-window", "Pre-FIST Nap", "admin"),
  E("party-fist", "FIST", "party", "Bushwick", "Basement"),
  E("food-win-son-bakery", "Win Son Bakery", "food", "E. Williamsburg"),
  E("food-kelloggs-diner", "Kellogg's Diner", "food", "Williamsburg"),
  E("food-frankels-delicatessen", "Frankel's Delicatessen", "food", "Greenpoint"),
  E("event-mermaid-parade", "Mermaid Parade", "event", "Coney Island"),
  E("spa-mermaid-spa", "Mermaid Spa", "spa", "Coney Island"),
  E("spa-russian-and-turkish-baths", "Russian & Turkish Baths", "spa", "East Village"),
  E("show-bushwick-comedy-club", "Bushwick Comedy Club", "show", "Bushwick"),
  E("show-bcc-eris-bar", "BCC at Eris Bar", "show", "Bushwick"),
  E("food-bong", "Bong", "food", "Bushwick"),
  E("admin-crossfit", "Crossfit (partner)", "admin"),
  E("museum-new-museum", "New Museum", "museum", "LES"),
  E("food-russ-and-daughters-cafe", "Russ & Daughters Cafe", "food", "LES"),
  E("food-cervos", "Cervo's", "food", "LES"),
  E("food-mam", "Mắm", "food", "LES"),
  E("party-mister-sunday-soul-summit", "Mister Sunday: Soul Summit", "party", "Ridgewood", "Nowadays"),
  E("travel-drive-brooklyn-new-windsor", "Drive: Brooklyn → New Windsor", "travel"),
  E("food-cornwall-coffee-co", "Cornwall Coffee Co.", "food", "New Windsor"),
  E("museum-storm-king-art-center", "Storm King Art Center", "museum", "New Windsor"),
  E("food-downstate-newburgh", "Downstate (Newburgh)", "food", "Newburgh"),
  E("hike-storm-king-mountain", "Storm King Mountain", "hike", "Cornwall"),
  E("museum-dia-beacon", "Dia Beacon", "museum", "Beacon"),
  E("travel-drive-new-windsor-hudson", "Drive: New Windsor → Hudson", "travel"),
  E("hike-kaaterskill-falls", "Kaaterskill Falls", "hike", "Catskills"),
  E("food-lil-debs-oasis", "Lil' Deb's Oasis", "food", "Hudson"),
  E("travel-drive-hudson-north-adams", "Drive: Hudson → North Adams", "travel"),
  E("hike-mount-greylock", "Mount Greylock", "hike", "Adams MA"),
  E("museum-clark-art-institute", "Clark Art Institute", "museum", "Williamstown"),
  E("food-blue-mango", "Blue Mango", "food", "Williamstown"),
  E("food-state-food-and-drink", "STATE Food + Drink", "food", "North Adams"),
  E("food-mission-bar-and-tapas", "Mission Bar + Tapas", "food", "North Adams"),
  E("hike-cascade-falls", "Cascade Falls", "hike", "North Adams"),
  E("museum-mass-moca", "MASS MoCA", "museum", "North Adams"),
  E("food-no-comply-foods", "No Comply Foods", "food", "Great Barrington"),
  E("food-mezze-bistro-and-bar", "Mezze Bistro + Bar", "food", "Williamstown"),
  E("attraction-hersheys-chocolate-world", "Hershey's Chocolate World", "attraction", "Hershey PA"),
  E("attraction-hersheypark", "Hersheypark", "attraction", "Hershey PA"),
  E("food-hersheypark-lunch", "Hersheypark food", "food", "Hershey PA"),
  E("travel-drive-hershey-nyc", "Drive: Hershey → NYC", "travel"),
  E("food-jr-and-son", "JR & Son", "food", "Williamsburg"),
  E("museum-met-cloisters", "Met Cloisters", "museum", "Washington Heights"),
  E("food-cocina-consuelo", "Cocina Consuelo", "food", "Hamilton Heights"),
  E("food-passerine", "Passerine", "food", "Union Square"),
  E("sight-the-high-line", "The High Line", "sight", "Chelsea"),
  E("vintage-procell", "Procell", "vintage", "LES"),
  E("vintage-desert-vintage", "Desert Vintage", "vintage", "LES"),
  E("event-nyc-drag-march", "NYC Drag March", "event", "East Village"),
  E("show-joes-pub", "Joe's Pub — 2Scoops", "show", "NoHo"),
  E("party-pure-honey", "Pure Honey", "party", "Bushwick", "House of Yes"),
  E("party-black-market-marathon", "Black Market Marathon", "party", "Bushwick", "3 Dollar Bill"),
  E("club-sultan-room", "Sultan Room", "club", "Bushwick"),
  E("food-wenwen", "Wenwen", "food", "Greenpoint"),
  E("food-sunday-in-brooklyn", "Sunday in Brooklyn", "food", "Williamsburg"),
  E("sight-jacob-riis-park", "Jacob Riis Park", "sight", "Queens"),
  E("event-ladyland", "Ladyland", "event", "Greenpoint"),
  E("event-nyc-pride-march", "NYC Pride March & PrideFest", "event", "Greenwich Village"),
];

// Contact / hours details for the entities most likely to be tapped. Merged in
// below; the rest simply have no contact fields (the popup hides what's absent).
const DETAILS: Record<string, Partial<PreviewEntity>> = {
  "food-deans": { address: "213 6th Ave, New York, NY", website: "https://deans.nyc", instagram: "@deans.nyc", hours: "Daily 4pm–late" },
  "party-fist": { address: "Basement, 29 Wyckoff Ave, Queens, NY", website: "https://ra.co/clubs/basement", instagram: "@fist.nyc", hours: "Fri 11pm–6am" },
  "food-russ-and-daughters-cafe": { address: "127 Orchard St, New York, NY", website: "https://www.russanddaughterscafe.com", instagram: "@russanddaughters", phone: "+1 212-475-4880", hours: "Sun 9am–3:30pm" },
  "museum-storm-king-art-center": { address: "1 Museum Rd, New Windsor, NY", website: "https://stormking.org", hours: "Wed–Mon 10am–5:30pm" },
  "museum-met-cloisters": { address: "99 Margaret Corbin Dr, New York, NY", website: "https://www.metmuseum.org", hours: "Thu–Tue 10am–5pm" },
  "museum-mass-moca": { address: "1040 MASS MoCA Way, North Adams, MA", website: "https://massmoca.org", hours: "Wed–Mon 10am–5pm" },
  "food-lil-debs-oasis": { address: "747 Columbia St, Hudson, NY", instagram: "@lildebsoasis", hours: "Mon 5–9pm (closed Tue–Wed)" },
  "food-no-comply-foods": { address: "Great Barrington, MA", instagram: "@nocomplyfoods", hours: "Wed–Sat 5–9pm" },
  "spa-mermaid-spa": { address: "3703 Mermaid Ave, Brooklyn, NY", phone: "+1 718-872-3878", hours: "Daily 9am–11pm" },
  "event-ladyland": { address: "Under the K Bridge Park, Brooklyn, NY", website: "https://www.ladylandfestival.com", instagram: "@ladylandfest" },
  "party-pure-honey": { address: "House of Yes, 2 Wyckoff Ave, Brooklyn, NY", instagram: "@purehoney", hours: "Fri 10pm–4am" },
  "food-blue-mango": { address: "27 Spring St, Williamstown, MA", hours: "Daily 11:30am–9:30pm" },
  "attraction-hersheypark": { address: "100 Hersheypark Dr, Hershey, PA", website: "https://www.hersheypark.com", hours: "Open 10am" },
  "sight-the-high-line": { address: "New York, NY", website: "https://www.thehighline.org", hours: "Daily 7am–10pm" },
  "food-wenwen": { address: "1065 Manhattan Ave, Brooklyn, NY", instagram: "@wenwen.nyc", hours: "Daily 11am–11pm" },
  "museum-new-museum": { address: "235 Bowery, New York, NY", website: "https://www.newmuseum.org", hours: "Tue–Sun 11am–6pm" },
  "sight-jacob-riis-park": { address: "Jacob Riis Park, Queens, NY", hours: "Beach — dawn to dusk" },
};
for (const e of PREVIEW_ENTITIES) Object.assign(e, DETAILS[e.id] ?? {});

export const PREVIEW_SLOTS: PreviewSlot[] = [
  { id: "thu18-arrival", day: "2026-06-18", start: "20:00", end: "23:00", label: "Arrival" },
  { id: "fri19-met", day: "2026-06-19", start: "10:00", end: "13:00", label: "Met morning" },
  { id: "fri19-seneca", day: "2026-06-19", start: "13:30", end: "14:00", label: "Seneca Village" },
  { id: "fri19-studio", day: "2026-06-19", start: "14:00", end: "17:00", label: "Studio Museum" },
  { id: "fri19-dinner", day: "2026-06-19", start: "18:00", end: "20:00", label: "Pre-FIST dinner" },
  { id: "fri19-nap", day: "2026-06-19", start: "20:00", end: "22:30", label: "Pre-FIST nap" },
  { id: "fri19-fist", day: "2026-06-19", start: "23:00", label: "FIST anniversary" },
  { id: "sat20-brunch", day: "2026-06-20", start: "11:00", end: "12:30", label: "Pre-parade brunch" },
  { id: "sat20-parade", day: "2026-06-20", start: "13:00", end: "16:00", label: "Mermaid Parade" },
  { id: "sat20-banya", day: "2026-06-20", start: "16:15", end: "20:30", label: "Banya + dinner" },
  { id: "sat20-comedy", day: "2026-06-20", start: "20:45", end: "21:45", label: "Comedy (maybe)" },
  { id: "sat20-bong", day: "2026-06-20", start: "22:00", end: "23:00", label: "Late dinner" },
  { id: "sun21-crossfit", day: "2026-06-21", start: "09:00", end: "10:00", label: "Crossfit (maybe)" },
  { id: "sun21-newmuseum", day: "2026-06-21", start: "11:00", end: "13:00", label: "New Museum" },
  { id: "sun21-brunch", day: "2026-06-21", start: "13:00", end: "14:30", label: "Russ & Daughters" },
  { id: "sun21-mistersunday", day: "2026-06-21", start: "15:00", end: "21:00", label: "Mister Sunday" },
  { id: "mon22-rental", day: "2026-06-22", start: "07:00", end: "09:00", label: "Drive: Brooklyn → New Windsor" },
  { id: "mon22-coffee", day: "2026-06-22", start: "09:00", end: "10:00", label: "Breakfast en route" },
  { id: "mon22-stormking", day: "2026-06-22", start: "10:00", end: "13:00", label: "Storm King Art Center" },
  { id: "mon22-lunch", day: "2026-06-22", start: "13:00", end: "14:00", label: "Lunch en route" },
  { id: "mon22-sktrail", day: "2026-06-22", start: "14:00", end: "16:00", label: "Storm King hike" },
  { id: "mon22-dia", day: "2026-06-22", start: "16:00", end: "17:00", label: "Dia Beacon (maybe)" },
  { id: "mon22-drivenorth", day: "2026-06-22", start: "17:00", end: "18:15", label: "Drive: New Windsor → Hudson" },
  { id: "mon22-kaaterskill", day: "2026-06-22", start: "18:15", end: "19:00", label: "Kaaterskill (optional)" },
  { id: "mon22-debs", day: "2026-06-22", start: "19:00", end: "20:30", label: "Lil' Deb's dinner" },
  { id: "mon22-drivebrk", day: "2026-06-22", start: "20:30", end: "22:00", label: "Drive: Hudson → North Adams" },
  { id: "tue23-greylock", day: "2026-06-23", start: "08:00", end: "14:00", label: "Mount Greylock hike" },
  { id: "tue23-clark", day: "2026-06-23", start: "15:00", end: "17:00", label: "Clark Art (if energy)" },
  { id: "tue23-dinner", day: "2026-06-23", start: "19:00", end: "21:00", label: "Berkshires dinner" },
  { id: "wed24-hike", day: "2026-06-24", start: "08:00", end: "12:00", label: "Cascade Falls hike" },
  { id: "wed24-massmoca", day: "2026-06-24", start: "13:00", end: "16:00", label: "MASS MoCA" },
  { id: "wed24-dinner", day: "2026-06-24", start: "17:00", end: "19:00", label: "Return dinner" },
  { id: "thu25-chocworld", day: "2026-06-25", start: "09:00", end: "10:30", label: "Chocolate World" },
  { id: "thu25-coasters-am", day: "2026-06-25", start: "11:00", end: "12:15", label: "Hersheypark AM" },
  { id: "thu25-lunch", day: "2026-06-25", start: "12:15", end: "13:00", label: "Hersheypark lunch" },
  { id: "thu25-coasters-pm", day: "2026-06-25", start: "13:00", end: "15:45", label: "Hersheypark PM" },
  { id: "thu25-waterpark", day: "2026-06-25", start: "16:00", end: "19:00", label: "Water park" },
  { id: "thu25-drive", day: "2026-06-25", start: "19:00", end: "22:30", label: "Drive: Hershey → NYC" },
  { id: "thu25-latedinner", day: "2026-06-25", start: "22:30", end: "23:30", label: "Late dinner" },
  { id: "fri26-cloisters", day: "2026-06-26", start: "10:00", end: "13:00", label: "Met Cloisters" },
  { id: "fri26-lunch", day: "2026-06-26", start: "13:00", end: "14:00", label: "Lunch south" },
  { id: "fri26-highline", day: "2026-06-26", start: "14:30", end: "17:30", label: "The High Line" },
  { id: "fri26-vintage", day: "2026-06-26", start: "18:00", end: "19:00", label: "Vintage" },
  { id: "fri26-dragmarch", day: "2026-06-26", start: "19:30", end: "21:00", label: "NYC Drag March" },
  { id: "fri26-joespub", day: "2026-06-26", start: "21:00", end: "22:00", label: "Joe's Pub" },
  { id: "fri26-parties", day: "2026-06-26", start: "22:00", label: "Party marathon" },
  { id: "sat27-brunch", day: "2026-06-27", start: "11:00", end: "12:30", label: "Pre-beach brunch" },
  { id: "sat27-riis", day: "2026-06-27", start: "13:00", end: "17:00", label: "Jacob Riis beach" },
  { id: "sat27-ladyland", day: "2026-06-27", start: "19:00", end: "23:59", label: "Ladyland" },
  { id: "sun28-pride", day: "2026-06-28", start: "11:30", end: "17:00", label: "Pride March" },
];

export const PREVIEW_INSTANCES: PreviewInstance[] = [
  { slotId: "thu18-arrival", entityId: "travel-arrival", capacity: "confirmed", note: "Land JFK/LGA/EWR → East Williamsburg. Late bite near the Airbnb." },
  { slotId: "fri19-met", entityId: "museum-met-fifth-avenue", capacity: "confirmed", note: "Costume Art exhibition. Lunch: Central Park picnic or Cocina Consuelo." },
  { slotId: "fri19-seneca", entityId: "event-seneca-village-juneteenth", capacity: "planned", note: "Free outdoor performance. Optional 20-min stop." },
  { slotId: "fri19-studio", entityId: "museum-studio-museum-in-harlem", capacity: "confirmed", note: "New Adjaye building. Juneteenth hours 11–8." },
  { slotId: "fri19-studio", entityId: "museum-moma", capacity: "planB", note: "If Harlem feels too far." },
  { slotId: "fri19-dinner", entityId: "food-deans", capacity: "confirmed", note: "DINNER — LOCKED. Oysters / langoustines / Guinness.", needsBooking: true, booked: true },
  { slotId: "fri19-dinner", entityId: "food-la-cantine", capacity: "planB", note: "Fallback if Dean's is full." },
  { slotId: "fri19-nap", entityId: "admin-pre-fist-nap-window", capacity: "confirmed", note: "Rest before the techno marathon." },
  { slotId: "fri19-fist", entityId: "party-fist", capacity: "confirmed", note: "FIST 10-Year. URGENT — will sell out.", needsBooking: true, booked: false },
  { slotId: "sat20-brunch", entityId: "food-win-son-bakery", capacity: "confirmed", note: "Scallion pancake sandos." },
  { slotId: "sat20-brunch", entityId: "food-kelloggs-diner", capacity: "planB" },
  { slotId: "sat20-brunch", entityId: "food-frankels-delicatessen", capacity: "planB" },
  { slotId: "sat20-parade", entityId: "event-mermaid-parade", capacity: "confirmed", note: "Surf Ave → boardwalk → Steeplechase." },
  { slotId: "sat20-banya", entityId: "spa-mermaid-spa", capacity: "confirmed", note: "Banya + cold plunge, dinner in robes." },
  { slotId: "sat20-banya", entityId: "spa-russian-and-turkish-baths", capacity: "planB", note: "Closer-to-home alt." },
  { slotId: "sat20-comedy", entityId: "show-bushwick-comedy-club", capacity: "planned", note: "Partner pick (MOS)." },
  { slotId: "sat20-comedy", entityId: "show-bcc-eris-bar", capacity: "planB" },
  { slotId: "sat20-bong", entityId: "food-bong", capacity: "confirmed" },
  { slotId: "sun21-crossfit", entityId: "admin-crossfit", capacity: "planB", note: "Partner maybe (MOS)." },
  { slotId: "sun21-newmuseum", entityId: "museum-new-museum", capacity: "confirmed", note: "New Humans exhibition." },
  { slotId: "sun21-brunch", entityId: "food-russ-and-daughters-cafe", capacity: "confirmed", note: "BRUNCH — LOCKED. Arrive 1:30 latest." },
  { slotId: "sun21-brunch", entityId: "food-cervos", capacity: "planB" },
  { slotId: "sun21-brunch", entityId: "food-mam", capacity: "planB" },
  { slotId: "sun21-mistersunday", entityId: "party-mister-sunday-soul-summit", capacity: "confirmed", note: "Soul Summit takeover. Solstice peak." },
  { slotId: "mon22-rental", entityId: "travel-drive-brooklyn-new-windsor", capacity: "confirmed", note: "Pick up SUV; drive Rte 9W." },
  { slotId: "mon22-coffee", entityId: "food-cornwall-coffee-co", capacity: "confirmed", note: "Coffee + pastry, eat in car." },
  { slotId: "mon22-stormking", entityId: "museum-storm-king-art-center", capacity: "confirmed", note: "500 acres — Calder / Serra / Maya Lin.", needsBooking: true, booked: true },
  { slotId: "mon22-lunch", entityId: "food-downstate-newburgh", capacity: "planned" },
  { slotId: "mon22-sktrail", entityId: "hike-storm-king-mountain", capacity: "planned", note: "2.4mi loop — skip if short on time." },
  { slotId: "mon22-dia", entityId: "museum-dia-beacon", capacity: "planned", note: "Optional Beacon stop." },
  { slotId: "mon22-drivenorth", entityId: "travel-drive-new-windsor-hudson", capacity: "confirmed", note: "Drive north via Catskills." },
  { slotId: "mon22-kaaterskill", entityId: "hike-kaaterskill-falls", capacity: "planned", note: "Optional waterfall. Skip if late." },
  { slotId: "mon22-debs", entityId: "food-lil-debs-oasis", capacity: "confirmed", note: "DINNER — LOCKED. Open Mon 5–9pm." },
  { slotId: "mon22-drivebrk", entityId: "travel-drive-hudson-north-adams", capacity: "confirmed", note: "~1h22 to the Berkshires base." },
  { slotId: "tue23-greylock", entityId: "hike-mount-greylock", capacity: "confirmed", note: "8.8mi, 2539ft. Packed lunch at summit." },
  { slotId: "tue23-clark", entityId: "museum-clark-art-institute", capacity: "planned", note: "Skip if too tired." },
  { slotId: "tue23-dinner", entityId: "food-blue-mango", capacity: "confirmed", note: "Reliable post-hike." },
  { slotId: "tue23-dinner", entityId: "food-state-food-and-drink", capacity: "planB", note: "Vietnamese Tuesdays — check calendar." },
  { slotId: "tue23-dinner", entityId: "food-mission-bar-and-tapas", capacity: "planB" },
  { slotId: "wed24-hike", entityId: "hike-cascade-falls", capacity: "planned", note: "4mi loop or Money Brook Falls." },
  { slotId: "wed24-massmoca", entityId: "museum-mass-moca", capacity: "confirmed", note: "Sol LeWitt / Kiefer / Turrell." },
  { slotId: "wed24-dinner", entityId: "food-no-comply-foods", capacity: "confirmed", note: "DINNER — LOCKED. No reservations." },
  { slotId: "wed24-dinner", entityId: "food-mezze-bistro-and-bar", capacity: "planB", note: "Splurge alt." },
  { slotId: "thu25-chocworld", entityId: "attraction-hersheys-chocolate-world", capacity: "confirmed", note: "Free factory tour. Opens 9am." },
  { slotId: "thu25-coasters-am", entityId: "attraction-hersheypark", capacity: "confirmed", note: "AM: Wildcat's Revenge, Skyrush.", needsBooking: true, booked: true },
  { slotId: "thu25-lunch", entityId: "food-hersheypark-lunch", capacity: "confirmed" },
  { slotId: "thu25-coasters-pm", entityId: "attraction-hersheypark", capacity: "confirmed", note: "PM thrills: Candymonium / Storm Runner." },
  { slotId: "thu25-waterpark", entityId: "attraction-hersheypark", capacity: "confirmed", note: "Boardwalk water park." },
  { slotId: "thu25-drive", entityId: "travel-drive-hershey-nyc", capacity: "confirmed", note: "I-78 east. Plan B: Philly Gayborhood drink." },
  { slotId: "thu25-latedinner", entityId: "food-jr-and-son", capacity: "planned", note: "Open till 11pm if back in time." },
  { slotId: "fri26-cloisters", entityId: "museum-met-cloisters", capacity: "confirmed", note: "Gardens + Unicorn Tapestries, Fort Tryon walk." },
  { slotId: "fri26-lunch", entityId: "food-cocina-consuelo", capacity: "confirmed" },
  { slotId: "fri26-lunch", entityId: "food-passerine", capacity: "planB" },
  { slotId: "fri26-lunch", entityId: "food-cervos", capacity: "planB" },
  { slotId: "fri26-highline", entityId: "sight-the-high-line", capacity: "confirmed" },
  { slotId: "fri26-vintage", entityId: "vintage-procell", capacity: "confirmed", note: "Pair with Desert Vintage if time." },
  { slotId: "fri26-vintage", entityId: "vintage-desert-vintage", capacity: "planB" },
  { slotId: "fri26-dragmarch", entityId: "event-nyc-drag-march", capacity: "confirmed", note: "Tompkins → Stonewall. Early dinner first." },
  { slotId: "fri26-joespub", entityId: "show-joes-pub", capacity: "planned", note: "2Scoops drag show." },
  { slotId: "fri26-parties", entityId: "party-pure-honey", capacity: "confirmed", note: "Pure Honey Pride @ HOY, 10pm–1am.", needsBooking: true, booked: false },
  { slotId: "fri26-parties", entityId: "party-black-market-marathon", capacity: "planB", note: "3DB Black Market 1–4am." },
  { slotId: "fri26-parties", entityId: "club-sultan-room", capacity: "planB" },
  { slotId: "sat27-brunch", entityId: "food-wenwen", capacity: "confirmed", note: "Taiwanese (BDSM Chicken)." },
  { slotId: "sat27-brunch", entityId: "food-kelloggs-diner", capacity: "planB" },
  { slotId: "sat27-brunch", entityId: "food-sunday-in-brooklyn", capacity: "planB" },
  { slotId: "sat27-riis", entityId: "sight-jacob-riis-park", capacity: "confirmed", note: "Queer beach Bay 1." },
  { slotId: "sat27-ladyland", entityId: "event-ladyland", capacity: "confirmed", note: "Kim Petras / Romy / CupcakKe.", needsBooking: true, booked: true },
  { slotId: "sun28-pride", entityId: "event-nyc-pride-march", capacity: "confirmed", note: "March noon. Brunch S&P; Buvette after. Flight 7pm+." },
];

/** Per-type colour for grid blocks: [bg, border, text, dot]. */
export const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; chip: string }> = {
  food: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-900", chip: "bg-amber-400" },
  vintage: { bg: "bg-yellow-50", border: "border-yellow-400", text: "text-yellow-900", chip: "bg-yellow-400" },
  museum: { bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-900", chip: "bg-violet-400" },
  club: { bg: "bg-fuchsia-50", border: "border-fuchsia-400", text: "text-fuchsia-900", chip: "bg-fuchsia-400" },
  party: { bg: "bg-fuchsia-50", border: "border-fuchsia-500", text: "text-fuchsia-900", chip: "bg-fuchsia-500" },
  bar: { bg: "bg-rose-50", border: "border-rose-400", text: "text-rose-900", chip: "bg-rose-400" },
  spa: { bg: "bg-teal-50", border: "border-teal-400", text: "text-teal-900", chip: "bg-teal-400" },
  sight: { bg: "bg-sky-50", border: "border-sky-400", text: "text-sky-900", chip: "bg-sky-400" },
  attraction: { bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-900", chip: "bg-orange-400" },
  hike: { bg: "bg-green-50", border: "border-green-500", text: "text-green-900", chip: "bg-green-500" },
  show: { bg: "bg-purple-50", border: "border-purple-400", text: "text-purple-900", chip: "bg-purple-400" },
  event: { bg: "bg-pink-50", border: "border-pink-500", text: "text-pink-900", chip: "bg-pink-500" },
  accommodation: { bg: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-900", chip: "bg-indigo-400" },
  travel: { bg: "bg-slate-100", border: "border-slate-400", text: "text-slate-700", chip: "bg-slate-400" },
  admin: { bg: "bg-zinc-100", border: "border-zinc-400", text: "text-zinc-600", chip: "bg-zinc-400" },
  uncategorised: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-600", chip: "bg-slate-300" },
};
