"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getImportLog,
  saveImportLog,
  type DBEntity,
  type ImportLog,
} from "@/lib/db";
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
  const [done, setDone] = useState<ImportLog | null>(null);
  const [lastLog, setLastLog] = useState<ImportLog | null>(null);

  // Surface the previous import so the result is reviewable after the dialog closed.
  useEffect(() => {
    getImportLog().then(setLastLog).catch(() => {});
  }, []);

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
      const log: ImportLog = {
        at: new Date().toISOString(),
        updated: preview.patches.length,
        noChange: preview.noChange,
        unmatched: preview.unmatched.length,
        skippedNoId: preview.skipped,
        flagged: preview.flagged.slice(0, 100).map((f) => ({ name: f.name, field: f.field, value: f.value })),
        samples: preview.patches.slice(0, 100).map((p) => ({ name: p.name, fields: p.changes.map((c) => c.field) })),
      };
      await saveImportLog(log);
      setDone(log);
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
              ✅ Updated {done.updated} {done.updated === 1 ? "entity" : "entities"}.
              {done.noChange > 0 && <span className="text-emerald-600"> · {done.noChange} unchanged</span>}
            </div>
            {done.flagged.length > 0 && <FlaggedBlock flagged={done.flagged} />}
            {done.unmatched > 0 && (
              <p className="text-xs text-amber-700">
                {done.unmatched} CSV {done.unmatched === 1 ? "row had an id" : "rows had ids"} not found in the
                database (ignored).
              </p>
            )}
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
              price, website, instagram and booking are overwritten; notes are only filled when
              empty. An Instagram link in the Website column is moved to Instagram automatically.
            </p>

            {/* Previous import — reviewable history */}
            {lastLog && !text.trim() && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="font-medium text-slate-600">
                  Last import · {new Date(lastLog.at).toLocaleString()}
                </p>
                <p className="mt-0.5 text-slate-500">
                  {lastLog.updated} updated · {lastLog.noChange} unchanged
                  {lastLog.unmatched > 0 && ` · ${lastLog.unmatched} unmatched`}
                  {lastLog.flagged.length > 0 && (
                    <span className="text-amber-700"> · {lastLog.flagged.length} flagged</span>
                  )}
                </p>
              </div>
            )}

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
                  {preview.flagged.length > 0 && (
                    <span className="text-amber-700">{preview.flagged.length} flagged (unsure)</span>
                  )}
                  {preview.unmatched.length > 0 && (
                    <span className="text-amber-700">{preview.unmatched.length} unmatched id</span>
                  )}
                  {preview.skipped > 0 && (
                    <span className="text-slate-400">{preview.skipped} rows without id</span>
                  )}
                </div>

                {preview.patches.length > 0 && (
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {preview.patches.slice(0, 60).map((p) => (
                      <li key={p.id} className="border-t border-slate-200 pt-1.5">
                        <span className="font-medium text-slate-700">{p.name}</span>
                        <ul className="mt-0.5 space-y-0.5 pl-1 text-slate-500">
                          {p.changes.map((c) => (
                            <li key={c.field}>
                              <span className="font-medium text-slate-600">{c.field}:</span>{" "}
                              {c.from ? (
                                <span className="text-rose-400 line-through">{trunc(c.from)}</span>
                              ) : (
                                <span className="italic text-slate-300">empty</span>
                              )}{" "}
                              → <span className="text-emerald-600">{trunc(c.to)}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                    {preview.patches.length > 60 && (
                      <li className="text-slate-400">…and {preview.patches.length - 60} more</li>
                    )}
                  </ul>
                )}

                {preview.flagged.length > 0 && (
                  <div className="mt-2 border-t border-slate-200 pt-1.5">
                    <FlaggedBlock flagged={preview.flagged} />
                  </div>
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

/** The "source was unsure" list — placeholder cells (N/A, unknown…) that were ignored. */
function FlaggedBlock({ flagged }: { flagged: { name: string; field: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
      <p className="font-medium text-amber-800">
        ⚠️ {flagged.length} {flagged.length === 1 ? "cell" : "cells"} looked unsure (e.g. “N/A”) and were
        ignored — fill these in by hand if you have them:
      </p>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-amber-700">
        {flagged.slice(0, 40).map((f, i) => (
          <li key={`${f.name}-${f.field}-${i}`}>
            <span className="font-medium">{f.name}</span> — {f.field}:{" "}
            <span className="italic">“{f.value}”</span>
          </li>
        ))}
        {flagged.length > 40 && <li>…and {flagged.length - 40} more</li>}
      </ul>
    </div>
  );
}

const trunc = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n)}…` : s);
