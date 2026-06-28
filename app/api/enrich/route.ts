// POST /api/enrich — asks Gemini (paid tier, gemini-2.5-flash + search grounding)
// to fill objective facts for a place given its name + type. Returns { fields }
// for the client to show in an approval card; NOTHING is written to the Database
// here. The Gemini key lives server-side only (GEMINI_API_KEY), never the browser.

import { NextResponse } from "next/server";
import {
  ENRICH_MODEL,
  ENRICH_SCHEMA,
  buildEnrichPrompt,
  cleanEnriched,
  type EnrichRequest,
} from "@/lib/enrich";
import { ENTITY_TABS } from "@/lib/entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(ENTITY_TABS.map((t) => t.type));
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${ENRICH_MODEL}:generateContent`;

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Enrichment is not configured. Set GEMINI_API_KEY in the environment." },
      { status: 503 }
    );
  }

  let body: Partial<EnrichRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const type = body.type;
  if (!name) return NextResponse.json({ error: "A place name is required." }, { status: 400 });
  if (!type || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "A valid entity type is required." }, { status: 400 });
  }

  const prompt = buildEnrichPrompt({ name, type, context: body.context });

  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ENRICH_SCHEMA,
          temperature: 0,
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the enrichment service." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Enrichment failed (${res.status}).`, detail: detail.slice(0, 500) },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => null);
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return NextResponse.json({ error: "Empty response from the model." }, { status: 502 });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Model did not return valid JSON." }, { status: 502 });
  }

  return NextResponse.json({ fields: cleanEnriched(parsed) });
}
