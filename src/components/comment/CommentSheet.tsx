"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Send, X } from "@/components/ui/icons";
import { Illustration } from "@/components/brand/illustrations";
import { useCommentStore } from "@/stores/commentStore";
import { timeAgo } from "@/lib/format";
import { LIMITS } from "@/lib/brand";
import { stripInvisibleChars, sanitizeForSubmit } from "@/lib/sanitize";
import { apiErrorMessage } from "@/lib/api";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import type { Comment, Gist } from "@/types";

// Same threshold as CommentPanel — only shows a countdown once someone's
// actually closing in on the ceiling.
const COMMENT_WARN_THRESHOLD = 20;

/** Bottom-sheet comment thread for a gist. Loads on open, posts inline. */
export function CommentSheet({
  open,
  onClose,
  gist,
}: {
  open: boolean;
  onClose: () => void;
  gist: Gist | undefined;
}) {
  const { itemsByGist, listByGist, create } = useCommentStore();
  const items: Comment[] = (gist?.gist_id && itemsByGist[gist.gist_id]) || [];
  // Not keyed off loadingByGist — see CommentPanel's identical fix: that
  // flag flips true one render after a gist switch, leaving a gap where
  // this would otherwise flash the empty state before the skeleton catches up.
  const loading = !!(open && gist?.gist_id && !itemsByGist[gist.gist_id]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  useEffect(() => {
    if (open && gist?.gist_id) {
      listByGist(gist.gist_id).catch(() => {});
    }
  }, [open, gist?.gist_id, listByGist]);

  const send = async () => {
    const gistId = gist?.gist_id;
    const clean = sanitizeForSubmit(text);
    if (!clean || !gistId) return;
    setSending(true);
    try {
      await create({ gist_id: gistId, text: clean });
      setText("");
    } catch (err) {
      // Matches CommentPanel: surface it instead of leaving the sheet
      // looking like nothing happened when send fails.
      setSendError(apiErrorMessage(err, "Failed to post comment — try again"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} variant="sheet">
      <ErrorModal open={!!sendError} onClose={() => setSendError(undefined)} message={sendError} />
      <div className="relative flex h-[80vh] flex-col overflow-hidden rounded-t-[2.5rem] bg-brand-ink">
        {/* Header */}
        <div className="relative flex items-center justify-center px-5 py-4">
          <span className="font-poppins text-sm font-medium text-white">
            {items.length} {items.length === 1 ? "Comment" : "Comments"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 rounded-full p-1 text-white/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 no-scrollbar">
          {loading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/10" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Illustration name="Commentmodal" className="h-28 w-auto opacity-80" />
              <p className="font-poppins text-sm font-semibold text-white/80">
                Nobody don talk yet, Talk your own na!
              </p>
            </div>
          ) : (
            <ul className="space-y-3 py-4">
              {items.map((c) => (
                <li key={c.comment_id} className="rounded-2xl bg-white/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-poppins text-xs font-bold text-brand-accent">
                      @{c.avitag ?? "someone"}
                    </span>
                    <span className="font-poppins text-[10px] text-white/50">
                      · {timeAgo(c.commented_at)}
                    </span>
                  </div>
                  <p className="mt-1 font-poppins text-sm text-white/90">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Composer */}
        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <div className="relative flex-1">
            <input
              value={text}
              onChange={(e) => setText(stripInvisibleChars(e.target.value).slice(0, LIMITS.comment))}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Talk your own..."
              className="w-full rounded-full bg-white/10 px-4 py-3 pr-12 font-poppins text-sm text-white outline-none placeholder:text-white/40"
            />
            {LIMITS.comment - text.length <= COMMENT_WARN_THRESHOLD && (
              <span
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-poppins text-[11px] tabular-nums"
                style={{ color: "var(--color-warning)" }}
              >
                {LIMITS.comment - text.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Send comment"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
