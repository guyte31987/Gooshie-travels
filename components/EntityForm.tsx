"use client";

import { useState } from "react";
import { ENTITY_TABS, type EntityType } from "@/lib/entities";
import { saveEntity, saveAreas, type DBEntity } from "@/lib/db";
import { slugId } from "@/lib/slug";

const FIELDS: { key: keyof DBEntity; label: string; textarea?: boolean }[] = [
  { key: "area", label: "Area / neighborhood" },
  { key: "address", label: "Address" },
  { key: "hours", label: "Hours" },
  { key: "price", label: "Price" },
  { key: "source", label: "Source" },
  { key: "booking", label: "Booking" },
  { key: "bestDay", label: "Best day" },
  { key: "notes", label: "Notes", textarea: true },
];

export function EntityForm({
  entity,
  areas,
  onClose,
}: {
  entity: DBEntity | null;
  areas: string[];
  onClose: () => void;
}) {
  const isNew = !entity;
  const [form, setForm] = useState<DBEntity>(
    entity ?? { id: "", name: "", type: "food", generalArea: "" }
  );
  const [busy, setBusy] = useState(false);

  const set = (k: keyof DBEntity, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const id = isNew ? slugId(form.type, form.name) : form.id;
      await saveEntity({ ...form, id, name: form.name.trim() });
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
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="input"
              autoFocus
            />
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
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
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
