"use client";

import { useMemo, useState } from "react";
import type { DBEntity } from "@/lib/db";
import { parseCsv, planImport, applyImport, type ImportPreview } from "@/lib/import";

export function ImportDialog({
  entities,
  onClose,
}: {
  entities: DBEntity[];
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const preview: ImportPreview | null = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return planImport(parseCsv(text), entities);
    } catch {
      return null;
    }
  }, [text, entities]);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const apply = async () => {
    if (!preview?.patches.length) return;
    setBusy(true);
    try {
      await applyImport(preview.patches);
      setDone(preview.patches.length);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import enriched CSV</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {done !== null ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
              ✅ Updated {done} {done === 1 ? "entity" : "entities"}.
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Paste (or upload) the CSV you exported and filled in. Rows are matched back by the{" "}
              <code className="rounded bg-slate-100 px-1">id</code> column. Geo, address, hours,
              price, website and booking are overwritten; notes are only filled when empty.
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="…or paste CSV text here (must include a header row with an id column)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-400"
            />

            {text.trim() && preview && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-slate-600">
                  <span className="text-emerald-700">{preview.patches.length} to update</span>
                  <span>{preview.noChange} unchanged</span>
                  {preview.unmatched.length > 0 && (
                    <span className="text-amber-700">{preview.unmatched.length} unmatched id</span>
                  )}
                  {preview.skipped > 0 && (
                    <span className="text-slate-400">{preview.skipped} rows without id</span>
                  )}
                </div>

                {preview.patches.length > 0 && (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                    {preview.patches.slice(0, 60).map((p) => (
                      <li key={p.id} className="border-t border-slate-200 pt-1.5">
                        <span className="font-medium text-slate-700">{p.name}</span>
                        <span className="text-slate-400">
                          {" "}
                          — {p.changes.map((c) => c.field).join(", ")}
                        </span>
                      </li>
                    ))}
                    {preview.patches.length > 60 && (
                      <li className="text-slate-400">…and {preview.patches.length - 60} more</li>
                    )}
                  </ul>
                )}

                {preview.unmatched.length > 0 && (
                  <p className="mt-2 border-t border-slate-200 pt-1.5 text-amber-700">
                    Not found in DB (skipped): {preview.unmatched.slice(0, 8).join(", ")}
                    {preview.unmatched.length > 8 ? "…" : ""}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500">
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={busy || !preview?.patches.length}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
              >
                {busy ? "Importing…" : `Import ${preview?.patches.length ?? 0}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
