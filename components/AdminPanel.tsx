"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

const ROLES: Role[] = ["viewer", "editor", "admin"];

export function AdminPanel() {
  const { isAdmin, loading } = useAuth();
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

  if (loading) return <Center>Loading…</Center>;
  if (!isAdmin) return <Center>Admins only.</Center>;

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    await inviteMember(email, inviteRole);
    setInviteEmail("");
    setMsg(`Invited ${email} as ${inviteRole}.`);
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <Link href="/" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          ← Back to trip
        </Link>
      </header>

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
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90">
            Pre-approve
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          They&apos;ll skip the pending queue and get in as soon as they sign in with this email.
        </p>
        {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
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

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{children}</div>
  );
}
