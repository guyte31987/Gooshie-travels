"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth, firebaseConfigured } from "@/lib/firebase";
import { resolveAccess, type AccessState } from "@/lib/access";
import type { Role } from "@/lib/members";

type AuthContextValue = {
  user: User | null;
  access: AccessState;
  role: Role | null;
  isAdmin: boolean;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  error: string | null;
  setError: (msg: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<AccessState>("unknown");
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccess = async (u: User | null) => {
    if (!u) {
      setAccess("unknown");
      setRole(null);
      return;
    }
    const result = await resolveAccess(u.email);
    setAccess(result.state);
    setRole(result.role);
  };

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      await loadAccess(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const refreshAccess = async () => {
    await loadAccess(auth?.currentUser ?? null);
  };

  const signInWithGoogle = async () => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!auth) return;
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Wrong email or password. First time? Use 'Forgot password' to set one.");
      } else {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
      throw e;
    }
  };

  const signUpWithPassword = async (email: string, password: string) => {
    if (!auth) return;
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Try signing in.");
      } else {
        setError(e instanceof Error ? e.message : "Could not create account");
      }
      throw e;
    }
  };

  const sendPasswordReset = async (email: string) => {
    if (!auth) return;
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset email");
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
        role,
        isAdmin: access === "admin",
        loading,
        configured: firebaseConfigured,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        sendPasswordReset,
        signOut,
        refreshAccess,
        error,
        setError,
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
