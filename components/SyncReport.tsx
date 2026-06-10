"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildEntities,
  buildSyncReport,
  type ItinDay,
  type SyncIssue,
  type IssueSeverity,
} from "@/lib/entities";
import { subscribeDismissedIssues, setDismissedIssues } from "@/lib/db";

const issueKey = (i: SyncIssue) => `${i.severity}:${i.kind}:${i.entity}`;

type ItinResponse = { days?: ItinDay[]; tz?: string; syncedAt?: string; count?: number };

const SEVERITY: Record<IssueSeverity, { label: string; dot: string; box: string }> = {
  conflict: { label: "Conflict", dot: "bg-rose-500", box: "border-rose-200 bg-rose-50" },
  warning: { label: "Warning", dot: "bg-amber-500", box: "border-amber-200 bg-amber-50" },
  info: { label: "Info", dot: "bg-sky-500", box: "border-sky-200 bg-sky-50" },
};

export function SyncReport() {
  const [allIssues, setAllIssues] = useState<SyncIssue[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resyncing, setResyncing] = useState(false);

  useEffect(() => subscribeDismissedIssues(setDismissed), []);

  const dismissedSet = new Set(dismissed);
  const issues = allIssues.filter((i) => !dismissedSet.has(issueKey(i)));

  const dismiss = (i: SyncIssue) => setDismissedIssues([...new Set([...dismissed, issueKey(i)])]);
  const restoreAll = () => setDismissedIssues([]);

  const load = useCallback(async (fresh: boolean) => {
    if (fresh) setResyncing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/itinerary${fresh ? "?fresh=1" : ""}`, {
        cache: "no-store",
      });
      const data: ItinResponse = await res.json();
      const entities = buildEntities(data.days ?? [], data.tz ?? "Europe/London");
      setAllIssues(buildSyncReport(entities));
      setSyncedAt(data.syncedAt ?? new Date().toISOString());
      setEventCount(data.count ?? 0);
    } finally {
      setLoading(false);
      setResyncing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const counts = {
    conflict: issues.filter((i) => i.severity === "conflict").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {syncedAt ? (
            <>
              Last synced {new Date(syncedAt).toLocaleString()} · {eventCount} calendar events
            </>
          ) : (
            "—"
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={resyncing}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {resyncing ? "Re-syncing…" : "↻ Re-sync now"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat n={counts.conflict} label="Conflicts" tone="text-rose-600" />
        <Stat n={counts.warning} label="Warnings" tone="text-amber-600" />
        <Stat n={counts.info} label="Info" tone="text-sky-600" />
      </div>

      {loading ? (
        <Note>Building report…</Note>
      ) : issues.length === 0 ? (
        <Note>✅ All clean — no conflicts or unresolved items.</Note>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue, i) => {
            const s = SEVERITY[issue.severity];
            return (
              <li key={i} className={`rounded-xl border p-3 ${s.box}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {issue.kind}
                  </span>
                  <span className="ml-auto text-sm font-medium">{issue.entity}</span>
                  <button
                    onClick={() => dismiss(issue)}
                    title="Dismiss this issue"
                    className="text-slate-400 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
                <p className="mt-1 text-sm text-slate-600">{issue.detail}</p>
              </li>
            );
          })}
        </ul>
      )}

      {dismissed.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>{dismissed.length} dismissed</span>
          <button onClick={restoreAll} className="underline-offset-2 hover:underline">
            Restore all
          </button>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        The plan re-syncs from your Google Calendar automatically on each load (and daily in the
        background). Use <strong>Re-sync now</strong> to force an immediate fresh pull. Dismiss
        issues you&apos;ve handled with the ✕; fix conflicts in Google Calendar or by editing the
        entity.
      </p>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className={`text-2xl font-semibold ${n ? tone : "text-slate-300"}`}>{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{children}</p>
  );
}
