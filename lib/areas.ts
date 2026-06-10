// "General area" — the broad geographic grouping a trip filters by (NYC, Upstate
// New York, Berkshires…). A managed list: the app suggests one from an entity's
// location, and admins can override or add new areas. Suggestion is keyword-based
// so it works offline.

export const DEFAULT_GENERAL_AREAS = [
  "New York City",
  "Upstate New York",
  "Berkshires (Western MA)",
  "Pennsylvania",
  "New Jersey",
] as const;

export type GeneralArea = string;

// Keyword → general area. Longest-match-first at lookup time.
const AREA_KEYWORDS: Record<string, GeneralArea> = {
  // NYC
  bushwick: "New York City",
  williamsburg: "New York City",
  greenpoint: "New York City",
  brooklyn: "New York City",
  manhattan: "New York City",
  queens: "New York City",
  "fort greene": "New York City",
  "prospect heights": "New York City",
  "clinton hill": "New York City",
  "crown heights": "New York City",
  "carroll gardens": "New York City",
  "carroll gdns": "New York City",
  "lower east side": "New York City",
  les: "New York City",
  "east village": "New York City",
  "west village": "New York City",
  "greenwich village": "New York City",
  nolita: "New York City",
  soho: "New York City",
  bowery: "New York City",
  "union square": "New York City",
  flatiron: "New York City",
  harlem: "New York City",
  "hamilton heights": "New York City",
  "fort tryon": "New York City",
  cloisters: "New York City",
  "coney island": "New York City",
  "bay ridge": "New York City",
  "sunset park": "New York City",
  "park slope": "New York City",
  "brighton beach": "New York City",
  "sea gate": "New York City",
  "jacob riis": "New York City",
  "riis park": "New York City",
  rockaway: "New York City",
  ridgewood: "New York City",
  "new york": "New York City",
  ", ny": "New York City",
  // Upstate NY
  "new windsor": "Upstate New York",
  "storm king": "Upstate New York",
  cornwall: "Upstate New York",
  newburgh: "Upstate New York",
  beacon: "Upstate New York",
  kaaterskill: "Upstate New York",
  hunter: "Upstate New York",
  hudson: "Upstate New York",
  // Berkshires / Western MA
  williamstown: "Berkshires (Western MA)",
  "north adams": "Berkshires (Western MA)",
  adams: "Berkshires (Western MA)",
  greylock: "Berkshires (Western MA)",
  "great barrington": "Berkshires (Western MA)",
  hancock: "Berkshires (Western MA)",
  "mass moca": "Berkshires (Western MA)",
  ma: "Berkshires (Western MA)",
  // PA
  hershey: "Pennsylvania",
  grantville: "Pennsylvania",
  pa: "Pennsylvania",
  // NJ
  "palisades park": "New Jersey",
  nj: "New Jersey",
};

const AREA_KEYS = Object.keys(AREA_KEYWORDS).sort((a, b) => b.length - a.length);

/** Suggest a general area from any location text; undefined if unknown. */
export function suggestGeneralArea(...texts: (string | undefined)[]): GeneralArea | undefined {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return undefined;
  for (const key of AREA_KEYS) {
    // " ny"/" ma" etc. need word-ish boundaries; others are substring-safe.
    if (key.length <= 3) {
      if (new RegExp(`\\b${key}\\b`).test(hay)) return AREA_KEYWORDS[key];
    } else if (hay.includes(key)) {
      return AREA_KEYWORDS[key];
    }
  }
  return undefined;
}
