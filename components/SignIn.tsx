"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup" | "reset";

export function SignIn() {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, sendPasswordReset, error, setError, configured } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setLocalError(null);
    setError(null);
    setResetSent(false);
    setPassword("");
    setConfirm("");
    setShowPass(false);
    setShowConfirm(false);
  };

  const displayError = localError || error;

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password);
    } catch { /* error set in context */ } finally {
      setBusy(false);
    }
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password !== confirm) {
      setLocalError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await signUpWithPassword(email, password);
    } catch { /* error set in context */ } finally {
      setBusy(false);
    }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch { /* error set in context */ } finally {
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

        {/* Google */}
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

        {/* Mode tabs */}
        <div className="mb-5 flex rounded-lg border border-slate-200 p-1 text-sm font-medium">
          <button
            onClick={() => switchMode("signin")}
            className={`flex-1 rounded-md py-1.5 transition ${mode === "signin" ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Sign in
          </button>
          <button
            onClick={() => switchMode("signup")}
            className={`flex-1 rounded-md py-1.5 transition ${mode === "signup" ? "bg-ink text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Request access
          </button>
        </div>

        {/* Sign in form */}
        {mode === "signin" && (
          <form onSubmit={onSignIn} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={!configured}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-slate-400 disabled:opacity-50"
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPass}
              onToggle={() => setShowPass((v) => !v)}
              placeholder="Password"
              disabled={!configured}
            />
            <button
              type="submit"
              disabled={!configured || busy}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Forgot password / First time? Set your password →
            </button>
          </form>
        )}

        {/* Request access / sign up form */}
        {mode === "signup" && (
          <form onSubmit={onSignUp} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={!configured}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm outline-none focus:border-slate-400 disabled:opacity-50"
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              show={showPass}
              onToggle={() => setShowPass((v) => !v)}
              placeholder="Choose a password (8+ characters)"
              disabled={!configured}
            />
            <PasswordField
              value={confirm}
              onChange={setConfirm}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              placeholder="Retype password"
              disabled={!configured}
            />
            <button
              type="submit"
              disabled={!configured || busy}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Request access"}
            </button>
            <p className="text-center text-xs text-slate-400">
              Guy will approve your request before you can see anything.
            </p>
          </form>
        )}

        {/* Forgot / reset password form */}
        {mode === "reset" && (
          resetSent ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Reset email sent to <strong>{email}</strong>. Check your inbox, set a password, then{" "}
              <button onClick={() => switchMode("signin")} className="underline">sign in here</button>.
            </div>
          ) : (
            <form onSubmit={onReset} className="space-y-3">
              <p className="text-sm text-slate-500">
                Enter your email and we&apos;ll send a link to set your password. Works for existing accounts too.
              </p>
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
                {busy ? "Sending…" : "Send reset email"}
              </button>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
              >
                ← Back to sign in
              </button>
            </form>
          )
        )}

        {displayError && <p className="mt-4 text-sm text-rose-600">{displayError}</p>}
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-10 text-sm shadow-sm outline-none focus:border-slate-400 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.63z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.73a5.4 5.4 0 0 1 0-3.46V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}
