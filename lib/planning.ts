import restaurantsData from "@/data/restaurants.json";
import vintageData from "@/data/vintage.json";
import bookingsData from "@/data/bookings.json";

export type Restaurant = {
  name: string;
  area: string;
  source: string;
  hours: string;
  price: string;
  why: string;
  days: string;
  booking: string;
  section: string;
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

export const restaurants = restaurantsData as Restaurant[];
export const vintage = vintageData as VintageShop[];
export const bookings = bookingsData as Booking[];

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
