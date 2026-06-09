"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailLink,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth, firebaseConfigured } from "@/lib/firebase";
import { resolveAccess, type AccessState } from "@/lib/access";

const EMAIL_KEY = "gooshie:emailForSignIn";

type AuthContextValue = {
  user: User | null;
  access: AccessState;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessState>("unknown");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    // Complete a magic-link sign-in if we arrived via the email link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem(EMAIL_KEY);
      if (!email) email = window.prompt("Confirm the email you used to request the link") || "";
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem(EMAIL_KEY);
            window.history.replaceState({}, "", window.location.pathname);
          })
          .catch((e) => setError(e.message));
      }
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAccess(u ? await resolveAccess(u.email) : "unknown");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    }
  };

  const sendMagicLink = async (email: string) => {
    if (!auth) return;
    setError(null);
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_KEY, email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the link");
      throw e;
    }
  };

  const signOut = async () => {
    if (auth) await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        access,
        loading,
        configured: firebaseConfigured,
        signInWithGoogle,
        sendMagicLink,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
