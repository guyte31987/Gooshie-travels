"use client";

// Audit page: review instance notes alongside entity notes, edit both,
// and save explicitly. Delete this page once migration is done.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeEntities, saveEntity, type DBEntity } from "@/lib/db";
import { savePlanInstance } from "@/lib/itinerary";
import { TRIPS } from "@/lib/trips";
import type { PlanInstance } from "@/lib/itinerary";

type Row = {
  instance: PlanInstance;
  entity: DBEntity;
};

function NoteRow({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [entityNote, setEntityNote] = useState(row.entity.notes ?? "");
  const [visitNote, setVisitNote] = useState(row.instance.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveEntity({ ...row.entity, notes: entityNote.trim() || undefined });
      await savePlanInstance({ ...row.instance, note: visitNote.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const ta = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-slate-400 resize-none bg-white";

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <p className="font-medium text-slate-800">{row.entity.name}
        <span className="ml-2 text-xs font-normal text-slate-400">{row.entity.type}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visit note</label>
          <textarea rows={3} value={visitNote} onChange={(e) => setVisitNote(e.target.value)} className={ta}
            placeholder="Visit-specific note (clear when done)" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Entity note</label>
          <textarea rows={3} value={entityNote} onChange={(e) => setEntityNote(e.target.value)} className={ta}
            placeholder="Standing note about this place" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
        <p className="text-[11px] text-slate-400">{row.instance.tripId} · slot {row.instance.slotId}</p>
      </div>
    </li>
  );
}

export default function InstanceNotesPage() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [entities, setEntities] = useState<DBEntity[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeEntities(setEntities);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !db || entities.length === 0) return;
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    Promise.all(
      TRIPS.map((t) =>
        getDocs(collection(db!, `tripPlanInstances/${t.id}/items`)).then((snap) =>
          snap.docs
            .map((d) => d.data() as PlanInstance)
            .filter((i) => i.note?.trim())
            .flatMap((i) => {
              const ent = entityMap.get(i.entityId);
              return ent ? [{ instance: i, entity: ent }] : [];
            })
        )
      )
    ).then((all) =>
      setRows(all.flat().sort((a, b) => a.entity.name.localeCompare(b.entity.name)))
    );
  }, [isAdmin, entities, tick]);

  if (loading) return <p className="p-8 text-sm text-slate-400">Loading…</p>;
  if (!isAdmin) return <p className="p-8 text-sm text-slate-400">Admins only. <Link href="/" className="underline">Back</Link></p>;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-slate-400 hover:underline">← Admin</Link>
        <h1 className="text-lg font-semibold">Instance notes audit</h1>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Every visit with a note. Edit either side, merge by copy-pasting, then Save. Clear the visit note once you've moved what you need.
      </p>

      {rows === null && <p className="text-sm text-slate-400">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-400">No instance notes found.</p>}

      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <NoteRow key={`${r.instance.id}-${i}`} row={r} onSaved={() => setTick((t) => t + 1)} />
          ))}
        </ul>
      )}
    </div>
  );
}
