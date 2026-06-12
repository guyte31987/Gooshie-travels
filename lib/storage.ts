"use client";

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";
export type PhotoContext = "entity" | "instance" | "comment";

export function photoPath(context: PhotoContext, contextId: string): string {
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `photos/${context}s/${contextId}/${rand}.jpg`;
}

export async function uploadPhoto(path: string, blob: Blob): Promise<string> {
  if (!storage) throw new Error("Firebase Storage is not configured.");
  const fileRef = ref(storage, path);
  const snap = await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(snap.ref);
}

export async function deletePhoto(url: string): Promise<void> {
  if (!storage) return;
  try {
    const match = url.match(/\/o\/(.+?)\?/);
    if (!match) return;
    const path = decodeURIComponent(match[1]);
    await deleteObject(ref(storage, path));
  } catch {
    // Silently ignore — file may already be gone.
  }
}
