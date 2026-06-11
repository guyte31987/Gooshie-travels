"use client";

// The return leg of the enrichment loop: take a CSV that was exported from the
// Database and filled in elsewhere (e.g. handed to Gemini to gather addresses,
// coordinates, hours, websites), and merge it back into the entities — matched
// by the stable `id` column. Objective facts overwrite; subjective curation
// (notes) is only filled when blank so hand-written context is never clobbered.

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { DBEntity } from "./db";

/**
 * Parse CSV text into rows of cells. Handles quoted fields, escaped double
 * quotes (""), commas and newlines inside quotes, and a leading BOM.
 */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

type Policy = "overwrite" | "fillBlank";

// Maps a (lowercased) CSV header to the entity field it writes and how. Headers
// not listed here (Name, Type, Closed, Trip slots…) are ignored on import — we
// never let an import rename or retype an entity, and identity stays put.
const FIELD_MAP: Record<string, { key: keyof DBEntity; policy: Policy; numeric?: boolean }> = {
  region: { key: "generalArea", policy: "overwrite" },
  area: { key: "area", policy: "overwrite" },
  address: { key: "address", policy: "overwrite" },
  lat: { key: "lat", policy: "overwrite", numeric: true },
  lng: { key: "lng", policy: "overwrite", numeric: true },
  website: { key: "website", policy: "overwrite" },
  instagram: { key: "instagram", policy: "overwrite" },
  hours: { key: "hours", policy: "overwrite" },
  price: { key: "price", policy: "overwrite" },
  booking: { key: "booking", policy: "overwrite" },
  notes: { key: "notes", policy: "fillBlank" },
};

export type ImportChange = { field: string; from: string; to: string };
export type ImportFlag = { id: string; name: string; field: string; value: string };
export type ImportPatch = {
  id: string;
  name: string;
  changes: ImportChange[];
  patch: Partial<DBEntity>;
};
export type ImportPreview = {
  patches: ImportPatch[];
  unmatched: string[]; // ids present in the CSV but not in the Database
  skipped: number;     // data rows with no id cell
  noChange: number;    // matched rows that would change nothing
  flagged: ImportFlag[]; // cells that looked like "N/A"/unknown placeholders (ignored)
};

// Values that mean "I don't actually know" — Gemini (or a human) sometimes writes
// these instead of leaving a cell blank. Treat them like a blank (never written)
// but surface them so the admin can see what the source was unsure about.
const PLACEHOLDER =
  /^(n\/?a|na|none|unknown|undefined|null|nil|tbd|tba|not\s+(available|found|applicable|listed|known)|no\s+(website|address|info|data|hours)|[-—–?.]+)$/i;

const isPlaceholder = (v: string) => PLACEHOLDER.test(v.trim());

// An unambiguous Instagram link — used to lift a handle that landed in the
// Website column over into the dedicated instagram field.
const isInstagramUrl = (v: string) => /(?:^|\/\/|\.)instagr(?:am\.com|\.am)\//i.test(v.trim());

/**
 * Diff a parsed CSV against the current Database without writing anything.
 * Returns the per-entity patches so the UI can preview before applying.
 */
export function planImport(rows: string[][], existing: DBEntity[]): ImportPreview {
  if (rows.length < 2) return { patches: [], unmatched: [], skipped: 0, noChange: 0, flagged: [] };
  const [header, ...body] = rows;
  const cols = header.map((h) => h.trim().toLowerCase());
  const idCol = cols.indexOf("id");
  const byId = new Map(existing.map((e) => [e.id, e]));
  const patches: ImportPatch[] = [];
  const unmatched: string[] = [];
  const flagged: ImportFlag[] = [];
  let skipped = 0;
  let noChange = 0;

  for (const r of body) {
    const id = idCol >= 0 ? (r[idCol] ?? "").trim() : "";
    if (!id) { skipped++; continue; }
    const ent = byId.get(id);
    if (!ent) { unmatched.push(id); continue; }

    const patch: Partial<DBEntity> = {};
    const changes: ImportChange[] = [];

    cols.forEach((col, idx) => {
      const map = FIELD_MAP[col];
      if (!map) return;
      const raw = (r[idx] ?? "").trim();
      if (raw === "") return; // a blank cell never clears existing data
      if (isPlaceholder(raw)) { flagged.push({ id, name: ent.name, field: col, value: raw }); return; }

      // Re-route an Instagram link that was dropped into the Website column.
      let key = map.key;
      let label = col;
      if (key === "website" && isInstagramUrl(raw)) { key = "instagram"; label = "instagram"; }

      const cur = ent[key];
      const curStr = cur == null ? "" : String(cur).trim();
      if (map.policy === "fillBlank" && curStr !== "") return; // protect manual curation

      let value: string | number = raw;
      if (map.numeric) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        value = n;
      }
      if (curStr === String(value)) return; // unchanged

      (patch as Record<string, unknown>)[key] = value;
      changes.push({ field: label, from: curStr, to: String(value) });
    });

    if (changes.length) patches.push({ id, name: ent.name, changes, patch });
    else noChange++;
  }

  return { patches, unmatched, skipped, noChange, flagged };
}

/** Write the planned patches to Firestore (merge — only the changed fields). */
export async function applyImport(patches: ImportPatch[]): Promise<void> {
  if (!db) return;
  for (const p of patches) {
    await setDoc(
      doc(db, "entities", p.id),
      { ...p.patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}
