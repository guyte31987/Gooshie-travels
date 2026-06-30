"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  approveMember,
  denyMember,
  inviteMember,
  removeMember,
  setRole,
  subscribeMembers,
  type Member,
  type Role,
} from "@/lib/members";
import { getEntities, saveEntity } from "@/lib/db";
import { geocodeAddress } from "@/lib/geo";
import { TripMapsFiller } from "./TripMapsFiller";

const ROLES: Role[] = ["viewer", "editor", "admin"];

export function AdminPanel() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeMembers(setMembers);
  }, [isAdmin]);

  const pending = useMemo(
    () => members.filter((m) => m.status === "pending").sort(byName),
    [members]
  );
  const approved = useMemo(
    () => members.filter((m) => m.status === "approved").sort(byName),
    [members]
  );
  const denied = useMemo(
    () => members.filter((m) => m.status === "denied").sort(byName),
    [members]
  );

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    await inviteMember(email, inviteRole);
    setInviteEmail("");
    setMsg(`Invited ${email} as ${inviteRole}.`);
  };

  // --- Backfill coordinates --------------------------------------------------
  // Geocode every entity that has an address but no lat/lng, so existing places
  // get precise map pins. Nominatim asks for ~1 req/sec, so we space the calls.
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  type BackfillRow = { name: string; address: string };
  const [backfillReport, setBackfillReport] = useState<{
    located: BackfillRow[];
    failed: BackfillRow[];
    skipped: number; // places with no address — can't geocode
    done: boolean;
  } | null>(null);

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillMsg("Loading places…");
    setBackfillReport(null);
    try {
      const all = await getEntities();
      const noAddress = all.filter(
        (e) => !(e.address ?? "").trim() && (e.lat === undefined || e.lng === undefined)
      ).length;
      const todo = all.filter(
        (e) => (e.address ?? "").trim() && (e.lat === undefined || e.lng === undefined)
      );
      const located: BackfillRow[] = [];
      const failed: BackfillRow[] = [];
      if (todo.length === 0) {
        setBackfillMsg("All places with an address already have coordinates. Nothing to do.");
        setBackfillReport({ located, failed, skipped: noAddress, done: true });
        return;
      }
      let done = 0;
      for (const e of todo) {
        setBackfillMsg(`Geocoding ${done + 1} of ${todo.length}… (${located.length} located)`);
        const addr = e.address!.trim();
        const pt = await geocodeAddress(addr);
        if (pt) {
          await saveEntity({ ...e, lat: pt.lat, lng: pt.lng });
          located.push({ name: e.name, address: addr });
        } else {
          failed.push({ name: e.name, address: addr });
        }
        // Update the running report so it fills in live.
        setBackfillReport({ located: [...located], failed: [...failed], skipped: noAddress, done: false });
        done++;
        // Be polite to Nominatim's ~1 req/sec usage policy.
        if (done < todo.length) await new Promise((r) => setTimeout(r, 1100));
      }
      setBackfillMsg(`Done. Located ${located.length} of ${todo.length} place${todo.length === 1 ? "" : "s"}.`);
      setBackfillReport({ located, failed, skipped: noAddress, done: true });
    } catch (err) {
      setBackfillMsg(err instanceof Error ? err.message : "Backfill failed.");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div>
      {/* Invite by email */}
      <Section title="Invite someone">
        <form onSubmit={onInvite} className="flex flex-wrap items-end gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="friend@email.com"
            required
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white hover:bg-rust/90">
            Pre-approve
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          They&apos;ll skip the pending queue and get in as soon as they sign in with this email.
        </p>
        {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
      </Section>

      {/* Maintenance */}
      <Section title="Maintenance">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">Backfill map coordinates</div>
              <div className="text-slate-500">
                Geocode every place that has an address but no pin location yet.
              </div>
            </div>
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white hover:bg-rust/90 disabled:opacity-50"
            >
              {backfilling ? "Running…" : "Run backfill"}
            </button>
          </div>
          {backfillMsg && <p className="mt-2 text-sm text-slate-600">{backfillMsg}</p>}

          {backfillReport && (
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-sm">
              {/* Summary line */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
                <span className="text-emerald-600">✓ {backfillReport.located.length} located</span>
                <span className="text-amber-600">✕ {backfillReport.failed.length} couldn&apos;t geocode</span>
                {backfillReport.skipped > 0 && (
                  <span className="text-slate-400">— {backfillReport.skipped} skipped (no address)</span>
                )}
              </div>

              {/* What didn't work — the actionable part */}
              {backfillReport.failed.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Couldn&apos;t locate — check these addresses
                  </p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-amber-200 bg-amber-50/60">
                    {backfillReport.failed.map((r, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="font-medium text-slate-700">{r.name}</div>
                        <div className="text-xs text-slate-500">{r.address}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What worked — collapsed detail */}
              {backfillReport.located.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Located ({backfillReport.located.length}) — show
                  </summary>
                  <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {backfillReport.located.map((r, i) => (
                      <li key={i} className="px-3 py-2">
                        <div className="font-medium text-slate-700">{r.name}</div>
                        <div className="text-xs text-slate-500">{r.address}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="mt-3">
          <TripMapsFiller />
        </div>
      </Section>

      {/* Pending requests */}
      <Section title={`Pending requests${pending.length ? ` (${pending.length})` : ""}`}>
        {pending.length === 0 ? (
          <Empty>No requests waiting.</Empty>
        ) : (
          <ul className="space-y-2">
            {pending.map((m) => (
              <li
                key={m.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-slate-500">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveMember(m.email, "viewer")}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => denyMember(m.email)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Members */}
      <Section title={`Members${approved.length ? ` (${approved.length})` : ""}`}>
        {approved.length === 0 ? (
          <Empty>No approved members yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {approved.map((m) => (
              <li
                key={m.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="text-sm">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-slate-500">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => setRole(m.email, e.target.value as Role)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeMember(m.email)}
                    className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Denied */}
      {denied.length > 0 && (
        <Section title={`Denied (${denied.length})`}>
          <ul className="space-y-2">
            {denied.map((m) => (
              <li
                key={m.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <span className="text-slate-500">{m.email}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveMember(m.email, "viewer")}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => removeMember(m.email)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function byName(a: Member, b: Member) {
  return (a.name || a.email).localeCompare(b.name || b.email);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-400">{children}</p>;
}
