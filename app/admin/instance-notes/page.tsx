"use client";

// Temporary audit page: shows every plan instance that has a note,
// alongside the entity name, so you can decide which notes should be
// promoted to entity.notes and which are genuinely visit-specific.
// Delete this page once migration is done.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeEntities, type DBEntity } from "@/lib/db";
import { TRIPS } from "@/lib/trips";
import type { PlanInstance } from "@/lib/itinerary";

type Row = {
  entityId: string;
  entityName: string;
  entityNotes: string;
  tripId: string;
  slotId: string;
  note: string;
};

export default function InstanceNotesPage() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [entities, setEntities] = useState<DBEntity[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeEntities(setEntities);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !db) return;
    const entityMap = new Map(entities.map((e) => [e.id, e]));
    if (entities.length === 0) return;

    Promise.all(
      TRIPS.map((t) =>
        getDocs(collection(db!, `tripPlanInstances/${t.id}/items`)).then((snap) =>
          snap.docs
            .map((d) => d.data() as PlanInstance)
            .filter((i) => i.note?.trim())
            .map((i) => {
              const ent = entityMap.get(i.entityId);
              return {
                entityId: i.entityId,
                entityName: ent?.name ?? i.entityId,
                entityNotes: ent?.notes ?? "",
                tripId: t.id,
                slotId: i.slotId,
                note: i.note!.trim(),
              };
            })
        )
      )
    ).then((all) => setRows(all.flat().sort((a, b) => a.entityName.localeCompare(b.entityName))));
  }, [isAdmin, entities]);

  if (loading) return <p className="p-8 text-sm text-slate-400">Loading…</p>;
  if (!isAdmin) return <p className="p-8 text-sm text-slate-400">Admins only. <Link href="/" className="underline">Back</Link></p>;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin" className="text-sm text-slate-400 hover:underline">← Admin</Link>
        <h1 className="text-lg font-semibold">Instance notes audit</h1>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Every visit that has a note. Use this to decide what belongs on the entity vs what's visit-specific.
        Entity notes (if any) are shown below each visit note for comparison.
      </p>

      {rows === null && <p className="text-sm text-slate-400">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-slate-400">No instance notes found.</p>}

      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-800">{r.entityName}</p>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-slate-400">Visit note: </span>{r.note}
              </p>
              {r.entityNotes ? (
                <p className="mt-1 text-sm text-slate-400">
                  <span className="font-medium">Entity note: </span>{r.entityNotes}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-300 italic">No entity note yet</p>
              )}
              <p className="mt-1.5 text-[11px] text-slate-300">{r.tripId} · slot {r.slotId}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
