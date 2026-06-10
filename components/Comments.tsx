"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { subscribeComments, addComment, deleteComment, type Comment } from "@/lib/db";

/** A lightweight comment thread for one instance (appearance). Photos/video
 * attach here too once the Phase-3 media host is wired in. */
export function Comments({ instanceId }: { instanceId: string }) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeComments(instanceId, setComments), [instanceId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setBusy(true);
    try {
      await addComment(
        instanceId,
        text.trim(),
        user.displayName || user.email || "Someone",
        (user.email || "").toLowerCase()
      );
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
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
