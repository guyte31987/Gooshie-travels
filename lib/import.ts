"use client";

// The return leg of the enrichment loop: take a CSV that was exported from the
// Database and filled in elsewhere (e.g. handed to Gemini to gather addresses,
// coordinates, hours, websites), and merge it back into the entities — matched
// by the stable `id` column. Objective facts overwrite; subjective curation
// (notes) is only filled when blank so hand-written context is never clobbered.

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { DBEntity } from "./db";
import { ENTITY_TABS, type EntityType } from "./entities";
import { slugId } from "./slug";

// The entity types an import is allowed to create. Mirrors the picker (ENTITY_TABS)
// and deliberately excludes the legacy "party" synonym — new data uses "club".
const VALID_TYPES = new Set<string>(ENTITY_TABS.map((t) => t.type));

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
export type ImportCreate = {
  id: string;
  name: string;
  type: EntityType;
  /** The fields that will be set on the new entity, for preview display. */
  fields: ImportChange[];
  /** The ready-to-write entity. */
  entity: DBEntity;
};
export type ImportPreview = {
  patches: ImportPatch[];
  creates: ImportCreate[]; // rows whose id is new → create a brand-new entity
  unmatched: string[]; // ids present in the CSV but not creatable (no Name/Type)
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
  if (rows.length < 2) return { patches: [], creates: [], unmatched: [], skipped: 0, noChange: 0, flagged: [] };
  const [header, ...body] = rows;
  const cols = header.map((h) => h.trim().toLowerCase());
  const idCol = cols.indexOf("id");
  const nameCol = cols.indexOf("name");
  const typeCol = cols.indexOf("type");
  // Only lift an Instagram link out of the Website column when there's no
  // dedicated instagram column — otherwise trust the explicit column.
  const hasInstagramCol = cols.includes("instagram");
  const byId = new Map(existing.map((e) => [e.id, e]));
  const patches: ImportPatch[] = [];
  const creates: ImportCreate[] = [];
  const unmatched: string[] = [];
  const flagged: ImportFlag[] = [];
  let skipped = 0;
  let noChange = 0;

  for (const r of body) {
    const id = idCol >= 0 ? (r[idCol] ?? "").trim() : "";
    if (!id) { skipped++; continue; }
    const ent = byId.get(id);
    if (!ent) {
      // New id → try to create a brand-new entity (needs a Name and a valid Type).
      const create = planCreate(r, cols, nameCol, typeCol, hasInstagramCol, byId, flagged);
      if (create) creates.push(create);
      else unmatched.push(id);
      continue;
    }

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
      if (key === "website" && !hasInstagramCol && isInstagramUrl(raw)) { key = "instagram"; label = "instagram"; }

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

  return { patches, creates, unmatched, skipped, noChange, flagged };
}

/**
 * Build a new-entity create from a CSV row whose id isn't in the Database yet.
 * Requires a non-blank Name and a valid Type; the id is recomputed canonically
 * via slugId so it stays consistent regardless of what the CSV's id cell said.
 * Returns undefined when the row can't be turned into an entity (→ unmatched).
 */
function planCreate(
  r: string[],
  cols: string[],
  nameCol: number,
  typeCol: number,
  hasInstagramCol: boolean,
  byId: Map<string, DBEntity>,
  flagged: ImportFlag[]
): ImportCreate | undefined {
  const name = nameCol >= 0 ? (r[nameCol] ?? "").trim() : "";
  const type = (typeCol >= 0 ? (r[typeCol] ?? "").trim().toLowerCase() : "") as EntityType;
  if (!name || !VALID_TYPES.has(type)) return undefined;

  const id = slugId(type, name);
  // Don't shadow an entity that already exists under the canonical id (the CSV's
  // id cell may have been off); fall through to unmatched so it's visible.
  if (byId.has(id)) return undefined;

  const entity: DBEntity = { id, name, type, calendarSource: false };
  const fields: ImportChange[] = [];

  cols.forEach((col, idx) => {
    const map = FIELD_MAP[col];
    if (!map) return;
    const raw = (r[idx] ?? "").trim();
    if (raw === "") return;
    if (isPlaceholder(raw)) { flagged.push({ id, name, field: col, value: raw }); return; }

    let key = map.key;
    let label = col;
    if (key === "website" && !hasInstagramCol && isInstagramUrl(raw)) { key = "instagram"; label = "instagram"; }

    let value: string | number = raw;
    if (map.numeric) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      value = n;
    }
    (entity as Record<string, unknown>)[key] = value;
    fields.push({ field: label, from: "", to: String(value) });
  });

  return { id, name, type, fields, entity };
}

/**
 * Write the planned changes to Firestore. Updates merge only the changed fields;
 * creates write the whole new entity (merge so a concurrent create can't fail).
 */
export async function applyImport(patches: ImportPatch[], creates: ImportCreate[] = []): Promise<void> {
  if (!db) return;
  for (const c of creates) {
    await setDoc(
      doc(db, "entities", c.id),
      { ...c.entity, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  for (const p of patches) {
    await setDoc(
      doc(db, "entities", p.id),
      { ...p.patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}
