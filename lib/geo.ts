// Offline geo resolver. The sandbox can't reach a geocoder, so we map known NYC
// neighborhoods and trip landmarks to approximate centroids. Pins are
// neighborhood-accurate (good enough for an overview); street-level geocoding
// can be layered on later. Co-located items get a small deterministic jitter so
// they don't stack perfectly on top of each other.

export type LatLng = { lat: number; lng: number };

// Ordered longest-key-first at lookup time. Keys are matched as substrings
// (case-insensitive) against an event/place location or a list item's area.
const PLACES: Record<string, LatLng> = {
  // --- Brooklyn neighborhoods ---
  "east williamsburg": { lat: 40.7141, lng: -73.9329 },
  williamsburg: { lat: 40.7081, lng: -73.9571 },
  bushwick: { lat: 40.6942, lng: -73.9213 },
  greenpoint: { lat: 40.7304, lng: -73.951 },
  "fort greene": { lat: 40.6892, lng: -73.974 },
  "prospect heights": { lat: 40.6774, lng: -73.9688 },
  "clinton hill": { lat: 40.6896, lng: -73.9665 },
  "crown heights": { lat: 40.6694, lng: -73.9442 },
  "carroll gardens": { lat: 40.6795, lng: -73.999 },
  "carroll gdns": { lat: 40.6795, lng: -73.999 },
  "coney island": { lat: 40.5755, lng: -73.9707 },
  "mermaid ave": { lat: 40.5767, lng: -73.9857 },
  "bay ridge": { lat: 40.6264, lng: -74.0299 },
  "sunset park": { lat: 40.6453, lng: -74.0119 },
  "park slope": { lat: 40.671, lng: -73.9814 },
  "brighton beach": { lat: 40.578, lng: -73.9597 },
  brooklyn: { lat: 40.6782, lng: -73.9442 },

  // --- Manhattan neighborhoods ---
  "lower east side": { lat: 40.715, lng: -73.9843 },
  les: { lat: 40.715, lng: -73.9843 },
  "east village": { lat: 40.7265, lng: -73.9815 },
  "west village": { lat: 40.7358, lng: -74.0036 },
  "greenwich village": { lat: 40.7336, lng: -74.0027 },
  nolita: { lat: 40.7228, lng: -73.9954 },
  soho: { lat: 40.7233, lng: -74.003 },
  bowery: { lat: 40.722, lng: -73.9934 },
  "union square": { lat: 40.7359, lng: -73.9911 },
  flatiron: { lat: 40.7411, lng: -73.9897 },
  "hamilton heights": { lat: 40.8226, lng: -73.9482 },
  harlem: { lat: 40.8116, lng: -73.9465 },
  "fort tryon": { lat: 40.8627, lng: -73.9319 },
  cloisters: { lat: 40.8649, lng: -73.9316 },
  "5th ave": { lat: 40.7794, lng: -73.9632 },
  "central park": { lat: 40.7812, lng: -73.9665 },
  "high line": { lat: 40.748, lng: -74.0048 },
  manhattan: { lat: 40.7831, lng: -73.9712 },

  // --- Queens ---
  "jacob riis": { lat: 40.5665, lng: -73.8769 },
  "riis park": { lat: 40.5665, lng: -73.8769 },
  rockaway: { lat: 40.586, lng: -73.812 },
  ridgewood: { lat: 40.7005, lng: -73.9015 },
  queens: { lat: 40.7282, lng: -73.7949 },

  // --- Hudson Valley ---
  "new windsor": { lat: 41.4751, lng: -74.101 },
  "storm king": { lat: 41.4262, lng: -74.0584 },
  "cornwall-on-hudson": { lat: 41.4459, lng: -74.0271 },
  cornwall: { lat: 41.4459, lng: -74.0271 },
  newburgh: { lat: 41.5034, lng: -74.0104 },
  beacon: { lat: 41.5048, lng: -73.9696 },
  kaaterskill: { lat: 42.1959, lng: -74.0631 },
  hunter: { lat: 42.2059, lng: -74.2129 },
  hudson: { lat: 42.2526, lng: -73.791 },

  // --- Berkshires (MA) ---
  williamstown: { lat: 42.7117, lng: -73.2037 },
  "north adams": { lat: 42.7009, lng: -73.1087 },
  "mass moca": { lat: 42.7009, lng: -73.1145 },
  adams: { lat: 42.6237, lng: -73.1176 },
  greylock: { lat: 42.6376, lng: -73.1665 },
  "great barrington": { lat: 42.1959, lng: -73.3618 },

  // --- Pennsylvania ---
  hershey: { lat: 40.2859, lng: -76.6502 },
  grantville: { lat: 40.3998, lng: -76.6552 },
  hancock: { lat: 42.557, lng: -73.2918 },

  // --- New Jersey ---
  "palisades park": { lat: 40.8482, lng: -73.9915 },
};

const KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length);

/** Small deterministic offset (~ up to ±250m) so co-located pins fan out. */
function jitter(seed: string): LatLng {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = (h % 1000) / 1000;
  const b = ((h >> 10) % 1000) / 1000;
  return { lat: (a - 0.5) * 0.005, lng: (b - 0.5) * 0.006 };
}

/**
 * Resolve a free-text location/area to approximate coordinates, or null if
 * nothing matches (vague locations like "A Train Corridor" stay off the map).
 */
export function resolvePoint(text: string | undefined, seed = ""): LatLng | null {
  if (!text) return null;
  const hay = text.toLowerCase();
  for (const key of KEYS) {
    if (hay.includes(key)) {
      const base = PLACES[key];
      const j = jitter(seed || text);
      return { lat: base.lat + j.lat, lng: base.lng + j.lng };
    }
  }
  return null;
}

/** Center + zoom that frames the NYC core (where most pins live). */
export const NYC_CENTER: LatLng = { lat: 40.715, lng: -73.95 };

/**
 * A Google Maps search/pin URL for an entity. Prefers exact coordinates, then a
 * full street address, then the name + neighborhood as a search query. Returns
 * null only when there's nothing locatable at all.
 */
export function googleMapsUrl(opts: {
  name?: string;
  address?: string;
  area?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
}): string | null {
  if (opts.mapsUrl?.trim()) return opts.mapsUrl.trim();
  const base = "https://www.google.com/maps/search/?api=1&query=";
  if (typeof opts.lat === "number" && typeof opts.lng === "number") {
    return `${base}${opts.lat},${opts.lng}`;
  }
  if (opts.address && opts.address.trim()) return `${base}${encodeURIComponent(opts.address.trim())}`;
  const q = [opts.name, opts.area].filter(Boolean).join(" ").trim();
  return q ? `${base}${encodeURIComponent(q)}` : null;
}

/** A safe external href: prepends https:// to bare domains so they don't resolve
 *  as a relative in-app path. Returns null for empty input. */
export function externalUrl(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
}

/** Normalise a stored Instagram value (full URL or @handle or bare handle) to a URL. */
export function instagramUrl(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/instagr(am\.com|\.am)\//i.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  return `https://instagram.com/${v.replace(/^@/, "")}`;
}

/** A display handle (@name) for a stored Instagram value, falling back to the raw value. */
export function instagramHandle(value: string | undefined): string {
  const v = value?.trim() ?? "";
  const h = v
    .replace(/^(https?:\/\/)?(www\.)?instagr(am\.com|\.am)\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  return h ? `@${h}` : v;
}
