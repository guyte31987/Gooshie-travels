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
    instagram: { type: "string", description: "Instagram handle or profile URL" },
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
    `- "notes" is one short line on why it's worth visiting — not a description dump.`,
  ].join("\n");
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
  out.instagram = str(raw.instagram);
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
