"use client";

import { useState, useEffect } from "react";
import { ENTITY_TABS, type EntityType } from "@/lib/entities";
import { saveEntity, saveAreas, subscribeEntities, type DBEntity } from "@/lib/db";
import { slugId } from "@/lib/slug";
import { requestEnrichment, type EnrichedFields } from "@/lib/enrich";
import { geocodeAddress } from "@/lib/geo";
import { useBackClose } from "@/lib/useBackClose";

const FIELDS: { key: keyof DBEntity; label: string; textarea?: boolean }[] = [
  { key: "area", label: "Area / neighborhood" },
  { key: "address", label: "Address" },
  { key: "mapsUrl", label: "Google Maps link" },
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "hours", label: "Hours" },
  { key: "price", label: "Price" },
  { key: "source", label: "Source" },
  { key: "booking", label: "Booking" },
  { key: "bestDay", label: "Best day" },
  { key: "notes", label: "Notes", textarea: true },
];

export function EntityForm({
  entity,
  areas = [],
  onClose,
}: {
  entity: DBEntity | null;
  areas?: string[];
  onClose: () => void;
}) {
  const isNew = !entity;
  const [form, setForm] = useState<DBEntity>(
    entity ?? { id: "", name: "", type: "food", generalArea: "" }
  );
  const [busy, setBusy] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [clubEntities, setClubEntities] = useState<DBEntity[]>([]);
  useBackClose(true, onClose);

  // Auto-fill only blank fields, so anything you've already typed is preserved.
  // The result is a draft in the form — you still review and click Save.
  const autoFill = async () => {
    if (!form.name.trim()) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const fields = await requestEnrichment({
        name: form.name.trim(),
        type: form.type,
        context: form.generalArea || undefined,
      });
      setForm((f) => {
        const next = { ...f };
        (Object.keys(fields) as (keyof EnrichedFields)[]).forEach((k) => {
          const cur = next[k as keyof DBEntity];
          const empty = cur === undefined || cur === null || String(cur).trim() === "";
          if (empty && fields[k] !== undefined) {
            (next as Record<string, unknown>)[k] = fields[k];
          }
        });
        return next;
      });
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Auto-fill failed.");
    } finally {
      setEnriching(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeEntities((all) =>
      setClubEntities(all.filter((e) => e.type === "club"))
    );
    return unsub;
  }, []);

  const showParent = form.type === "club" || form.type === "party" || form.type === "event";

  const set = (k: keyof DBEntity, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const id = isNew ? slugId(form.type, form.name) : form.id;
      const next: DBEntity = { ...form, id, name: form.name.trim() };
      // Geocode to precise street-level coords when there's an address and we
      // either have none yet or the address changed. Pins then land exactly,
      // instead of falling back to the approximate neighborhood centroid.
      const addr = next.address?.trim();
      const addressChanged = (entity?.address ?? "") !== (next.address ?? "");
      const needsCoords = next.lat === undefined || next.lng === undefined;
      if (addr && (needsCoords || addressChanged)) {
        const pt = await geocodeAddress(addr);
        if (pt) {
          next.lat = pt.lat;
          next.lng = pt.lng;
        }
      }
      await saveEntity(next);
      // Persist a brand-new general area into the managed list.
      if (form.generalArea && !areas.includes(form.generalArea)) {
        await saveAreas([...areas, form.generalArea].sort());
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isNew ? "New entity" : "Edit entity"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <div className="flex gap-2">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="input"
                autoFocus
              />
              <button
                type="button"
                onClick={autoFill}
                disabled={enriching || !form.name.trim()}
                title="Look up address, hours, website… with AI. Fills blank fields only; you review before saving."
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {enriching ? "…" : "✨ Auto-fill"}
              </button>
            </div>
            {enrichError && <p className="mt-1 text-xs text-amber-700">{enrichError}</p>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as EntityType)}
                className="input"
              >
                {ENTITY_TABS.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region (general area)">
              <input
                list="area-options"
                value={form.generalArea ?? ""}
                onChange={(e) => set("generalArea", e.target.value)}
                className="input"
                placeholder="Type or pick…"
              />
              <datalist id="area-options">
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>
          </div>

          {showParent && clubEntities.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Parent venue <span className="font-normal text-slate-400">(optional — links this to a club)</span>
              </label>
              <select
                value={form.parentId ?? ""}
                onChange={(ev) => set("parentId", ev.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option value="">None</option>
                {clubEntities
                  .filter((c) => c.id !== form.id)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {FIELDS.map((f) => (
            <Field key={String(f.key)} label={f.label}>
              {f.textarea ? (
                <textarea
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  rows={2}
                  className="input"
                />
              ) : (
                <input
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="input"
                />
              )}
            </Field>
          ))}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.closed}
              onChange={(e) => set("closed", e.target.checked)}
            />
            Permanently closed
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !form.name.trim()}
            className="rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white hover:bg-rust/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(203 213 225);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.input:focus) {
          border-color: rgb(148 163 184);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
