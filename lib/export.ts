"use client";

// Client-side exports: CSV, Excel (.xlsx via SheetJS), and Word (.doc via an
// HTML document Word opens natively — no heavy dependency). Used to double-check
// the plan offline and to feed places back into Google Calendar.

import * as XLSX from "xlsx";
import type { Entity } from "./entities";

export type Column<T> = { header: string; get: (row: T) => string };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rowsOf<T>(data: T[], cols: Column<T>[]): string[][] {
  return data.map((row) => cols.map((c) => c.get(row) ?? ""));
}

export function exportCsv<T>(data: T[], cols: Column<T>[], filename: string) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c.header)).join(",")];
  for (const r of rowsOf(data, cols)) lines.push(r.map(esc).join(","));
  download(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export function exportExcel<T>(data: T[], cols: Column<T>[], filename: string) {
  const aoa = [cols.map((c) => c.header), ...rowsOf(data, cols)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportWord<T>(data: T[], cols: Column<T>[], filename: string, title: string) {
  const esc = (v: string) =>
    String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const head = cols.map((c) => `<th>${esc(c.header)}</th>`).join("");
  const body = rowsOf(data, cols)
    .map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Calibri,Arial,sans-serif;font-size:11pt}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#eee}</style></head><body>
    <h2>${esc(title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`;
  download(new Blob([html], { type: "application/msword" }), `${filename}.doc`);
}

// Standard column set for exporting entities. `id` is first so the CSV can be
// enriched (e.g. by Gemini) and re-imported, matched back by this stable key.
export const ENTITY_COLUMNS: Column<Entity>[] = [
  { header: "id", get: (e) => e.id },
  { header: "Name", get: (e) => e.name },
  { header: "Type", get: (e) => e.type },
  { header: "Region", get: (e) => e.generalArea ?? "" },
  { header: "Area", get: (e) => e.area ?? "" },
  { header: "Address", get: (e) => e.address ?? "" },
  { header: "Lat", get: (e) => (typeof e.lat === "number" ? String(e.lat) : "") },
  { header: "Lng", get: (e) => (typeof e.lng === "number" ? String(e.lng) : "") },
  { header: "Website", get: (e) => e.website ?? "" },
  { header: "Instagram", get: (e) => e.instagram ?? "" },
  { header: "Hours", get: (e) => e.hours ?? "" },
  { header: "Price", get: (e) => e.price ?? "" },
  { header: "Booking", get: (e) => e.booking ?? "" },
  { header: "Closed", get: (e) => (e.closed ? "CLOSED" : "") },
  { header: "Notes", get: (e) => e.notes ?? "" },
  {
    header: "Trip slots",
    get: (e) => e.slots.map((s) => `${s.kind}${s.label ? " " + s.label : ""}`).join(" | "),
  },
];

export function exportEntities(
  entities: Entity[],
  format: "csv" | "excel" | "word",
  filename: string
) {
  if (format === "csv") exportCsv(entities, ENTITY_COLUMNS, filename);
  else if (format === "excel") exportExcel(entities, ENTITY_COLUMNS, filename);
  else exportWord(entities, ENTITY_COLUMNS, filename, filename);
}
