"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  subscribeComments,
  subscribeEntityComments,
  addComment,
  addEntityComment,
  deleteComment,
  type Comment,
} from "@/lib/db";

/** Comment thread for either an entity instance (a specific visit) or a general entity (the place). */
export function Comments({
  instanceId,
  entityId,
  label,
}: {
  /** Pass for entity-instance-level comments (about this specific visit). */
  instanceId?: string;
  /** Pass for entity-level comments (about the place in general). */
  entityId?: string;
  /** Optional heading shown above the thread. */
  label?: string;
}) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (instanceId) return subscribeComments(instanceId, setComments);
    if (entityId) return subscribeEntityComments(entityId, setComments);
  }, [instanceId, entityId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setBusy(true);
    const name = user.displayName || user.email || "Someone";
    const email = (user.email || "").toLowerCase();
    try {
      if (instanceId) await addComment(instanceId, text.trim(), name, email);
      else if (entityId) await addEntityComment(entityId, text.trim(), name, email);
      setText("");
    } finally {
      setBusy(false);
    }
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
                      onClick={() => deleteComment(c.id)}
                      className="text-xs text-slate-300 hover:text-rose-500"
                    >
                      delete
                    </button>
                  )}
                </div>
                <p className="text-slate-700">{c.text}</p>
              </li>
            );
          })}
        </ul>
      )}
      {user && (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm outline-none focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
          >
            Post
          </button>
        </form>
      )}
      <button
        type="button"
        disabled
        title="Photos & video arrive with the media host (Phase 3)"
        className="mt-1.5 text-xs text-slate-300"
      >
        📷 Add photo/video (soon)
      </button>
    </div>
  );
}
