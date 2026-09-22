"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { X, Send } from "@/components/ui/icons";
import { useSpotStore } from "@/stores/spotStore";
import { timeAgo } from "@/lib/format";
import { gistColorFor } from "@/lib/brand";

const COMMENT_MAX_LEN = 500;

/**
 * Spot's own comment surface — deliberately simpler than Gist's
 * CommentSheet/CommentList/CommentComposer (no reactions on comments, no
 * media/GIF composer — Spot comments are plain text only, see the backend's
 * own scope decision), so this is a small dedicated sheet rather than
 * forcing Gist's more elaborate components to serve a second, thinner data
 * shape.
 */
export function SpotCommentSheet({
  open,
  onClose,
  spotId,
  commentCount,
}: {
  open: boolean;
  onClose: () => void;
  spotId: string | null;
  commentCount: number;
}) {
  const commentsBySpot = useSpotStore((s) => s.commentsBySpot);
  const loadingBySpot = useSpotStore((s) => s.commentsLoadingBySpot);
  const fetchComments = useSpotStore((s) => s.fetchComments);
  const addComment = useSpotStore((s) => s.addComment);

  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comments = (spotId && commentsBySpot[spotId]) || [];
  const loading = !!(spotId && loadingBySpot[spotId]) && comments.length === 0;

  useEffect(() => {
    if (open && spotId) void fetchComments(spotId);
  }, [open, spotId, fetchComments]);

  useEffect(() => {
    if (!open) {
      setText("");
      setError(null);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !spotId || posting) return;
    setPosting(true);
    setError(null);
    try {
      await addComment(spotId, trimmed);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post your comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} variant="sheet">
      <div className="flex h-[80dvh] flex-col overflow-hidden rounded-t-[2.5rem] bg-surface dark:bg-brand-ink">
        <div className="relative flex shrink-0 items-center justify-center border-b border-line bg-brand/[0.04] px-5 py-4 dark:border-white/10 dark:bg-brand-ink/85">
          {commentCount > 0 && (
            <span className="font-nunito text-sm font-medium text-ink dark:text-white">
              {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 rounded-full p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <span className="font-nunito text-sm font-bold text-ink dark:text-white">No comments yet</span>
              <span className="font-nunito text-[12.5px] text-muted">Be the first to say something</span>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {comments.map((c) => (
                <li key={c.comment_id} className="flex items-start gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-extrabold text-white"
                    style={{ backgroundColor: gistColorFor(c.avitag) }}
                  >
                    {c.image_url ? <Avatar src={c.image_url} /> : c.avitag.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-nunito text-[12.5px] font-extrabold text-ink dark:text-white">
                        {c.first_name || c.avitag}
                      </span>
                      <span className="font-nunito text-[10.5px] text-faint">{timeAgo(c.commented_at)}</span>
                    </div>
                    <p className="mt-0.5 break-words font-nunito text-[13px] text-ink/90 dark:text-white/85">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-5 pb-1">
            <span className="font-nunito text-[12px] font-semibold text-danger">{error}</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] dark:border-white/10">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX_LEN))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Add a comment…"
            className="flex-1 rounded-full bg-surface-2 px-4 py-2.5 font-nunito text-[13px] text-ink placeholder:text-faint focus:outline-none dark:bg-white/10 dark:text-white"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || posting}
            aria-label="Send comment"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
