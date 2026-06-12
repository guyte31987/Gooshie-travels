"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  subscribeComments,
  subscribeEntityComments,
  addComment,
  addEntityComment,
  updateComment,
  deleteComment,
  type Comment,
} from "@/lib/db";
import { PhotoCropModal } from "./PhotoCropModal";
import { uploadPhoto, photoPath, deletePhoto } from "@/lib/storage";

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

  // Photo attach for new comment
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
        photoUrl = await uploadPhoto(photoPath("comment", contextId), pendingPhotoBlob);
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
            const canAct = mine || isAdmin;
            return (
              <CommentItem
                key={c.id}
                comment={c}
                canEdit={mine}
                canDelete={canAct}
                instanceId={instanceId}
                entityId={entityId}
                onDelete={() => handleDeleteComment(c)}
              />
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

function CommentItem({
  comment,
  canEdit,
  canDelete,
  instanceId,
  entityId,
  onDelete,
}: {
  comment: Comment;
  canEdit: boolean;
  canDelete: boolean;
  instanceId?: string;
  entityId?: string;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [editPhotoBlob, setEditPhotoBlob] = useState<Blob | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [srcForCrop, setSrcForCrop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditText(comment.text);
    setEditPhotoBlob(null);
    setEditPhotoPreview(null);
    setRemovePhoto(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview);
    setEditPhotoBlob(null);
    setEditPhotoPreview(null);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSrcForCrop(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropConfirm = (blob: Blob) => {
    setSrcForCrop(null);
    setEditPhotoBlob(blob);
    if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview);
    setEditPhotoPreview(URL.createObjectURL(blob));
    setRemovePhoto(false);
  };

  const saveEdit = async () => {
    if (!editText.trim() && !editPhotoBlob && !comment.photoUrl) return;
    setBusy(true);
    try {
      let newPhotoUrl: string | undefined = comment.photoUrl;

      if (removePhoto && comment.photoUrl) {
        await deletePhoto(comment.photoUrl).catch(() => {});
        newPhotoUrl = undefined;
      }

      if (editPhotoBlob) {
        if (comment.photoUrl && !removePhoto) await deletePhoto(comment.photoUrl).catch(() => {});
        const contextId = instanceId ?? entityId ?? "general";
        newPhotoUrl = await uploadPhoto(photoPath("comment", contextId), editPhotoBlob);
      }

      await updateComment(comment.id, editText.trim(), newPhotoUrl);
      setEditing(false);
      if (editPhotoPreview) URL.revokeObjectURL(editPhotoPreview);
      setEditPhotoBlob(null);
      setEditPhotoPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const displayPhoto = removePhoto ? null : (editPhotoPreview ?? comment.photoUrl ?? null);

  return (
    <li className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{comment.authorName}</span>
        {!editing && (
          <div className="flex gap-2">
            {canEdit && (
              <button onClick={startEdit} className="text-xs text-slate-300 hover:text-slate-500">
                edit
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete} className="text-xs text-slate-300 hover:text-rose-500">
                delete
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-1.5 space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
          />

          {displayPhoto && (
            <div className="relative inline-block">
              <img src={displayPhoto} alt="" className="h-20 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => {
                  if (editPhotoPreview) { URL.revokeObjectURL(editPhotoPreview); setEditPhotoBlob(null); setEditPhotoPreview(null); }
                  setRemovePhoto(true);
                }}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              📷 {displayPhoto ? "Replace photo" : "Attach photo"}
            </button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={cancelEdit} className="text-xs text-slate-400 hover:text-slate-600">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy}
                className="rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {srcForCrop && (
            <PhotoCropModal
              imageSrc={srcForCrop}
              onConfirm={handleCropConfirm}
              onCancel={() => setSrcForCrop(null)}
            />
          )}
        </div>
      ) : (
        <>
          {comment.text && <p className="text-slate-700">{comment.text}</p>}
          {comment.photoUrl && (
            <img src={comment.photoUrl} alt="" className="mt-1.5 max-h-48 rounded-lg object-cover" />
          )}
        </>
      )}
    </li>
  );
}
