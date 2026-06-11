import restaurantsData from "@/data/restaurants.json";
import vintageData from "@/data/vintage.json";
import bookingsData from "@/data/bookings.json";
import museumsData from "@/data/museums.json";
import clubsData from "@/data/clubs.json";
import barsData from "@/data/bars.json";
import spasData from "@/data/spas.json";
import sightsData from "@/data/sights.json";
import hikesData from "@/data/hikes.json";
import attractionsData from "@/data/attractions.json";
import showsData from "@/data/shows.json";
import eventsData from "@/data/events.json";

export type Restaurant = {
  name: string;
  area: string;
  source: string;
  hours: string;
  oldHours?: string;
  price: string;
  why: string;
  days: string;
  booking: string;
  section: string;
  closed?: boolean;
};

export type VintageShop = {
  name: string;
  area: string;
  address: string;
  hours: string;
  vibe: string;
  price: string;
  bestDay: string;
  borough: string;
};

export type Booking = {
  priority: string;
  task: string;
  who: string;
  status: string;
  deadline: string;
  cost: string;
  platform: string;
  notes: string;
};

/**
 * A curated place seeded from a hand-maintained JSON list (the same way
 * restaurants/vintage are). One shape for every non-food/vintage category; the
 * category comes from which file it lives in, except parties which carry an
 * explicit `type` + `parent` (the club venue they belong to).
 */
export type SeedPlace = {
  name: string;
  /** Overrides the file's default type — used for parties inside clubs.json. */
  type?: "party";
  /** Parent venue NAME (a club). Resolved to a parentId at build time. */
  parent?: string;
  area?: string;
  generalArea?: string;
  address?: string;
  website?: string;
  hours?: string;
  price?: string;
  booking?: string;
  bestDay?: string;
  notes?: string;
};

export const restaurants = restaurantsData as Restaurant[];
export const vintage = vintageData as VintageShop[];
export const bookings = bookingsData as Booking[];

export const museums = museumsData as SeedPlace[];
export const clubs = clubsData as SeedPlace[];
export const bars = barsData as SeedPlace[];
export const spas = spasData as SeedPlace[];
export const sights = sightsData as SeedPlace[];
export const hikes = hikesData as SeedPlace[];
export const attractions = attractionsData as SeedPlace[];
export const shows = showsData as SeedPlace[];
export const events = eventsData as SeedPlace[];

/** Distinct, sorted values of a string field — handy for filter dropdowns. */
export function distinct<T>(items: T[], pick: (t: T) => string): string[] {
  return Array.from(new Set(items.map(pick).filter(Boolean))).sort();
}

/** Normalize the many "$"/"$$"/"$13–17" price strings into a coarse tier 1–4. */
export function priceTier(price: string): number {
  const dollars = (price.match(/\$/g) || []).length;
  if (dollars >= 1 && dollars <= 4 && !/\d/.test(price)) return dollars;
  const nums = price.match(/\d+/g)?.map(Number) ?? [];
  const max = nums.length ? Math.max(...nums) : 0;
  if (max === 0) return 0;
  if (max < 20) return 1;
  if (max < 40) return 2;
  if (max < 70) return 3;
  return 4;
}
