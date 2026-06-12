"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  subscribeComments,
  subscribeEntityComments,
  addComment,
  addEntityComment,
  deleteComment,
  type Comment,
} from "@/lib/db";
import { PhotoCropModal } from "./PhotoCropModal";
import { uploadPhoto, photoPath, deletePhoto } from "@/lib/storage";

/** Comment thread for either an entity instance (a specific visit) or a general entity (the place). */
export function Comments({
  instanceId,
  entityId,
  label,
  onPosted,
}: {
  instanceId?: string;
  entityId?: string;
  label?: string;
  onPosted?: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Photo attach state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [srcForCrop, setSrcForCrop] = useState<string | null>(null);
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (instanceId) return subscribeComments(instanceId, setComments);
    if (entityId) return subscribeEntityComments(entityId, setComments);
  }, [instanceId, entityId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSrcForCrop(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropConfirm = (blob: Blob) => {
    setSrcForCrop(null);
    setPendingPhotoBlob(blob);
    setPendingPhotoPreview(URL.createObjectURL(blob));
  };

  const clearPendingPhoto = () => {
    setPendingPhotoBlob(null);
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    setPendingPhotoPreview(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !pendingPhotoBlob) || !user) return;
    setBusy(true);
    const name = user.displayName || user.email || "Someone";
    const email = (user.email || "").toLowerCase();
    try {
      let photoUrl: string | undefined;
      if (pendingPhotoBlob) {
        const contextId = instanceId ?? entityId ?? "general";
        const path = photoPath("comment", contextId);
        photoUrl = await uploadPhoto(path, pendingPhotoBlob);
      }
      if (instanceId) await addComment(instanceId, text.trim(), name, email, photoUrl);
      else if (entityId) await addEntityComment(entityId, text.trim(), name, email, photoUrl);
      setText("");
      clearPendingPhoto();
      onPosted?.();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteComment = async (c: Comment) => {
    if (c.photoUrl) await deletePhoto(c.photoUrl).catch(() => {});
    await deleteComment(c.id);
  };

  return (
    <div className="mt-2">
      {label && (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
      )}
      {comments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {comments.map((c) => {
            const mine = (user?.email || "").toLowerCase() === c.authorEmail;
            return (
              <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">{c.authorName}</span>
                  {(mine || isAdmin) && (
                    <button
                      onClick={() => handleDeleteComment(c)}
                      className="text-xs text-slate-300 hover:text-rose-500"
                    >
                      delete
                    </button>
                  )}
                </div>
                {c.text && <p className="text-slate-700">{c.text}</p>}
                {c.photoUrl && (
                  <img
                    src={c.photoUrl}
                    alt=""
                    className="mt-1.5 max-h-48 rounded-lg object-cover"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {user && (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={busy || (!text.trim() && !pendingPhotoBlob)}
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
            >
              {busy ? "…" : "Post"}
            </button>
          </div>

          {/* Pending photo preview */}
          {pendingPhotoPreview && (
            <div className="relative inline-block">
              <img src={pendingPhotoPreview} alt="" className="h-20 rounded-lg object-cover" />
              <button
                type="button"
                onClick={clearPendingPhoto}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            📷 {pendingPhotoPreview ? "Change photo" : "Attach photo"}
          </button>
        </form>
      )}

      {srcForCrop && (
        <PhotoCropModal
          imageSrc={srcForCrop}
          onConfirm={handleCropConfirm}
          onCancel={() => setSrcForCrop(null)}
        />
      )}
    </div>
  );
}
