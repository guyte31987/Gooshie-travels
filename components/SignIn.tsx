"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function SignIn() {
  const { signInWithGoogle, sendMagicLink, error, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch {
      /* error surfaced via context */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Gooshie Travels</h1>
          <p className="mt-2 text-sm text-slate-500">Trips, shared with friends.</p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Firebase isn&apos;t configured yet. Add the web config env vars to enable sign-in.
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={!configured}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
        </div>

        {sent ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Check <strong>{email}</strong> for a sign-in link. Open it on this device.
          </div>
        ) : (
          <form onSubmit={onMagic} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={!configured}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-slate-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!configured || busy}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.63z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.73a5.4 5.4 0 0 1 0-3.46V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
