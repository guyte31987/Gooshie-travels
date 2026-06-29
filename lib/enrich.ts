// Shared contract for AI place-enrichment. The /api/enrich route asks Gemini to
// fill these objective facts for a place given just its name + type; the client
// shows them in an approval card before anything is written to the Database.
// Nothing here talks to Gemini — the route owns the key. This file is the schema
// both sides agree on, so it's safe to import from the browser.

import type { EntityType } from "./entities";

/** The fields enrichment may fill. All optional — unknowns are left absent. */
export type EnrichedFields = {
  area?: string;
  address?: string;
  lat?: number;
  lng?: number;
  website?: string;
  instagram?: string;
  hours?: string;
  price?: string;
  booking?: string;
  notes?: string;
};

export type EnrichRequest = { name: string; type: EntityType; context?: string };
export type EnrichResponse = { fields: EnrichedFields };

/** The model id to use — free-tier, fast, plenty for venue lookups. */
export const ENRICH_MODEL = "gemini-2.5-flash";

/**
 * JSON Schema handed to Gemini (responseSchema). Mirrors EnrichedFields. No
 * `required` — the model omits anything it isn't confident about rather than
 * inventing it.
 */
export const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    area: { type: "string", description: "Neighbourhood, e.g. Bushwick" },
    address: { type: "string", description: "Full street address" },
    lat: { type: "number", description: "Decimal latitude" },
    lng: { type: "number", description: "Decimal longitude" },
    website: { type: "string", description: "Official website URL" },
    instagram: { type: "string", description: "Instagram handle or profile URL, e.g. @bossa or https://instagram.com/bossa" },
    hours: { type: "string", description: "Opening hours, free text" },
    price: { type: "string", description: "Price level $ to $$$$, or a range" },
    booking: { type: "string", description: "How to book, e.g. Resident Advisor, walk-in" },
    notes: { type: "string", description: "One short line on why it's worth visiting" },
  },
} as const;

/** The instruction text. Strict: real facts only, blanks over guesses. */
export function buildEnrichPrompt(req: EnrichRequest): string {
  const where = req.context?.trim() || "New York City";
  return [
    `You are a careful travel-research assistant. Return objective facts about a specific real place.`,
    `Place name: "${req.name}"`,
    `Type: ${req.type}`,
    `Likely location / context: ${where}`,
    ``,
    `Rules:`,
    `- Only report facts you are confident are correct for THIS place.`,
    `- If you are unsure of a field, OMIT it entirely — never guess, never write "N/A", "unknown", or a placeholder.`,
    `- If you cannot confidently identify the place at all, return an empty object {}.`,
    `- Coordinates should be the venue's own location if you know it; omit if approximate.`,
    `- For "area": infer the neighbourhood/district from the address (e.g. Bushwick, Shoreditch). This is safe to estimate from a known address — don't leave it blank if you have the address.`,
    `- For "hours": if the search results or the place's listing show opening hours as text, include them (free text is fine, e.g. "Mon–Fri 9–5, Sat 10–4"). Omit only if you genuinely can't find them.`,
    `- "notes" is one short line on why it's worth visiting — not a description dump.`,
    `- For "website": only a real official URL you're confident exists; otherwise omit.`,
    `- For "instagram": the official account handle (e.g. @bossa) or profile URL. Only include if you can verify it via search; omit if uncertain.`,
    ``,
    `Output: return ONLY a single JSON object with the keys above (any you're unsure of omitted). No prose, no markdown fences — just the JSON.`,
  ].join("\n");
}

/**
 * Pull a JSON object out of a model response. With search grounding enabled we
 * can't use responseSchema/JSON mime type (Gemini rejects that combo with a
 * 400), so the model returns text that should be JSON but may be wrapped in
 * prose or ```json fences. Extract the first balanced {...} block and parse it.
 * Returns null if nothing parseable is found.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(slice);
          return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Accept an Instagram value only if it's a real handle or instagram.com URL,
 * normalised to a clean profile URL. Anything with spaces, a search phrase, or
 * an invalid handle is rejected (→ undefined) so guesses never reach the form.
 */
export function sanitizeInstagram(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v.trim();
  if (!s || /\s/.test(s)) return undefined; // search phrases have spaces
  // Pull the handle out of a URL if present.
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  s = s.replace(/^@/, "");
  // Valid IG handle: letters, numbers, dot, underscore; 1–30 chars.
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) return undefined;
  if (!/[A-Za-z0-9]/.test(s)) return undefined; // not only dots/underscores
  return `https://instagram.com/${s}`;
}

/** Drop empty strings / non-finite numbers so blanks never reach the DB. */
export function cleanEnriched(raw: Record<string, unknown>): EnrichedFields {
  const out: EnrichedFields = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  out.area = str(raw.area);
  out.address = str(raw.address);
  out.lat = num(raw.lat);
  out.lng = num(raw.lng);
  out.website = str(raw.website);
  // Instagram is not auto-filled — only accept it if a future grounded model
  // returns a genuinely valid handle/URL; guesses are dropped by sanitize.
  out.instagram = sanitizeInstagram(raw.instagram);
  out.hours = str(raw.hours);
  out.price = str(raw.price);
  out.booking = str(raw.booking);
  out.notes = str(raw.notes);
  // Drop keys that ended up undefined for a clean payload.
  (Object.keys(out) as (keyof EnrichedFields)[]).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

/**
 * Client helper: call /api/enrich for a single place. Throws with a readable
 * message on failure (e.g. the key isn't configured) so the UI can surface it.
 */
export async function requestEnrichment(req: EnrichRequest): Promise<EnrichedFields> {
  const res = await fetch("/api/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Enrichment failed (${res.status}).`);
  return (data as EnrichResponse).fields ?? {};
}
