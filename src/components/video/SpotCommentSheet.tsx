"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Illustration } from "@/components/brand/illustrations";
import { CommentSkeletonItem } from "@/components/comment/CommentList";
import { X, RefreshCw, SendIconFill, Heart, DeleteIconFill } from "@/components/ui/icons";
import { ConfirmModal, ErrorModal } from "@/components/ui/FeedbackModal";
import { useSpotStore, type SpotComment } from "@/stores/spotStore";
import { useAuthStore, useIsAdmin } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { gistColorFor } from "@/lib/brand";
import { playSound } from "@/lib/sounds";

const COMMENT_MAX_LEN = 500;
const COMMENT_TRUNCATE_LENGTH = 200;

/** Collapses long comment bodies behind a "...more" toggle — same treatment
 * and threshold as CommentList.tsx's own CommentBody, just not shared code
 * since that one isn't exported (Spot comments have no reaction/delete row
 * beneath the text, so the two aren't quite the same component). */
function SpotCommentBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COMMENT_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? text : text.slice(0, COMMENT_TRUNCATE_LENGTH).trimEnd();
  return (
    <p className="break-words font-nunito text-sm leading-relaxed text-ink/90 dark:text-white/90">
      {shown}
      {isLong && !expanded && "… "}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-nunito text-sm font-semibold text-brand-accent hover:underline"
        >
          {expanded ? " less" : "more"}
        </button>
      )}
    </p>
  );
}

/** A single comment bubble — same chat-bubble shape (tail, rounded-tl-none,
 * shadow), staggered pop-in entrance, tap-to-like row, and own/admin delete
 * as Gist's own CommentBubble. `key={comment_id}` on the wrapping motion.li
 * is what makes framer-motion's `initial` play once per real comment
 * instead of replaying on unrelated re-renders. */
function SpotCommentBubble({
  comment: c,
  index,
  onReact,
  onDelete,
}: {
  comment: SpotComment;
  index: number;
  onReact: () => void;
  /** Resolves/rejects with the real delete outcome — SpotCommentSheet's own
   * handleDelete does the actual store call and surfaces a failure through
   * the shared ErrorModal; this bubble only needs to know whether to stop
   * its own spinner and close its own confirm modal. */
  onDelete: () => Promise<void>;
}) {
  const avatarColor = gistColorFor(c.avitag);
  const schoolInfo = [c.major_tag, c.campus_tag].filter(Boolean).join(" ");
  const reacted = !!c.my_reaction;
  const avitag = useAuthStore((s) => s.avitag);
  const isOwn = c.avitag === avitag;
  const isAdmin = useIsAdmin();
  const canDelete = isOwn || isAdmin;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      playSound("delete");
    } catch {
      // Failure is surfaced by the sheet's own shared ErrorModal — just
      // stop spinning and leave the confirm modal open so the author/admin
      // can see the error behind it and retry or cancel.
    } finally {
      setDeleting(false);
    }
  };
  return (
    <motion.li
      className="relative ml-3 rounded-2xl"
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.4), ease: "easeOut" }}
    >
      <svg
        className="absolute -left-3 top-0 h-4 w-3 text-surface-2 dark:text-[#2B3B5A]"
        viewBox="0 0 12 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0H0L12 16V0Z" />
      </svg>
      <div className="relative rounded-2xl rounded-tl-none bg-surface-2 p-4 text-ink shadow-sm dark:bg-[#2B3B5A] dark:text-white">
        <div className="flex items-start justify-between">
          <Link href={`/${c.avitag}`} className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-extrabold text-white"
              style={{ backgroundColor: avatarColor }}
            >
              {c.image_url ? <Avatar src={c.image_url} /> : c.avitag.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-col">
              <span className="font-nunito text-sm font-semibold">{c.first_name ?? c.avitag.replace(/_?\d+$/, "")}</span>
              <span className="font-nunito text-xs text-muted dark:text-white/70">{c.avitag}</span>
            </div>
          </Link>
          <div className="flex flex-col items-end">
            <span className="font-nunito text-xs text-ink/80 dark:text-white/90">{timeAgo(c.commented_at)}</span>
            {schoolInfo && (
              <span className="mt-1 font-nunito text-xs uppercase tracking-wide text-muted dark:text-white/70">
                {schoolInfo}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4">
          <SpotCommentBody text={c.text} />
        </div>
        {/* Tap-to-like on the left (heart icon, scale-pop-on-react
            animation, count shown only once it's non-zero), Delete on the
            right when this bubble is either the viewer's own comment or the
            viewer is an admin moderating someone else's — same layout as
            Gist's own CommentBubble. */}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onReact}
            aria-label={reacted ? "Remove reaction" : "React"}
            className="flex items-center gap-1 rounded-full py-0.5 pr-1 transition active:scale-90"
          >
            <motion.span
              className="flex"
              animate={reacted ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              <Heart
                fill={reacted ? "currentColor" : "none"}
                className={`h-[18px] w-[18px] transition ${
                  reacted ? "text-brand" : "text-muted dark:text-white/60"
                }`}
              />
            </motion.span>
            {!!c.reactions_count && (
              <span
                className={`font-nunito text-xs ${
                  reacted ? "text-brand" : "text-muted dark:text-white/60"
                }`}
              >
                {c.reactions_count}
              </span>
            )}
          </button>

          {canDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete comment"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 active:scale-90"
            >
              <DeleteIconFill className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {canDelete && (
        <ConfirmModal
          open={showDeleteConfirm}
          onClose={() => (deleting ? undefined : setShowDeleteConfirm(false))}
          onConfirm={handleConfirmDelete}
          loading={deleting}
          title={isOwn ? "Delete your comment?" : `Delete @${c.avitag}'s comment?`}
          message={isOwn ? "This can't be undone." : "This can't be undone — you're deleting this as an admin."}
          confirmLabel="Delete"
          icon={<DeleteIconFill size={26} weight="fill" />}
        />
      )}
    </motion.li>
  );
}

/**
 * Spot's own comment surface — same loading skeleton, empty state, bubble
 * shape/entrance animation, tap-to-like, own/admin delete, and animated
 * send button as Gist's CommentSheet/CommentList/CommentComposer.
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
  const errorBySpot = useSpotStore((s) => s.commentsErrorBySpot);
  const fetchComments = useSpotStore((s) => s.fetchComments);
  const addComment = useSpotStore((s) => s.addComment);
  const reactSpotComment = useSpotStore((s) => s.reactSpotComment);
  const unreactSpotComment = useSpotStore((s) => s.unreactSpotComment);
  const removeSpotComment = useSpotStore((s) => s.removeSpotComment);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const items = (spotId && commentsBySpot[spotId]) || [];
  // Genuinely fetched (even to zero results), not just "hasn't loaded yet"
  // — same distinction CommentList.tsx's own `cached` draws, and for the
  // same reason: keyed off presence in the map, not array length, so a
  // real empty result doesn't get confused with "still loading".
  const cached = !!(spotId && spotId in commentsBySpot);
  const hasError = !cached && !!(spotId && errorBySpot[spotId]);
  const showSkeleton = (!spotId || !cached) && !hasError;

  useEffect(() => {
    if (open && spotId) void fetchComments(spotId);
  }, [open, spotId, fetchComments]);

  useEffect(() => {
    if (!open) {
      setText("");
      setSendError(undefined);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !spotId || sending) return;
    if (!requireAuth("leave a comment")) return;
    setSending(true);
    setSendError(undefined);
    try {
      await addComment(spotId, trimmed);
      // Clears only on success — a failed send leaves the draft intact so
      // nothing typed is lost, same as Gist's CommentComposer.
      setText("");
      playSound("whoosh");
    } catch (err) {
      setSendError(apiErrorMessage(err, "Failed to post comment — try again"));
    } finally {
      setSending(false);
    }
  };

  // No try/catch — reactSpotComment/unreactSpotComment revert optimistic
  // state silently on failure, same as toggleLike, so there's nothing here
  // to catch (see spotStore's own doc on why).
  const handleReact = (comment: SpotComment) => {
    if (!requireAuth("react to comments")) return;
    if (!spotId) return;
    if (comment.my_reaction) void unreactSpotComment(spotId, comment.comment_id);
    else {
      void reactSpotComment(spotId, comment.comment_id);
      playSound("pop");
    }
  };

  // removeSpotComment already sets its own store-level error and rethrows on
  // failure — caught here purely to surface it through this sheet's shared
  // ErrorModal and let it propagate back up to the calling SpotCommentBubble
  // too, so its confirm modal knows to stop spinning (and stay open) rather
  // than silently closing on a failure. Same shape as CommentList's own
  // handleCommentDelete.
  const handleDelete = async (commentId: string) => {
    if (!spotId) throw new Error("Missing spot");
    try {
      await removeSpotComment(spotId, commentId);
    } catch (err) {
      setSendError(apiErrorMessage(err, "Failed to delete comment"));
      throw err;
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 no-scrollbar">
          <ErrorModal open={!!sendError} onClose={() => setSendError(undefined)} message={sendError} />
          {showSkeleton ? (
            <ul className="space-y-4 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <CommentSkeletonItem key={i} short={i % 2 === 1} />
              ))}
            </ul>
          ) : hasError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="h-8 w-8 text-muted" />
              <p className="font-nunito text-sm font-semibold text-muted dark:text-white/80">
                Abeg we no fit load comments — check your connection.
              </p>
              <button
                type="button"
                onClick={() => spotId && fetchComments(spotId)}
                className="rounded-full bg-brand px-4 py-1.5 font-nunito text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Illustration name="Commentmodal" className="h-28 w-auto opacity-80" />
              <p className="font-nunito text-sm font-semibold text-muted dark:text-white/80">
                Nobody don talk yet, Talk your own na!
              </p>
            </div>
          ) : (
            <ul className="space-y-4 py-1">
              {items.map((c, i) => (
                <SpotCommentBubble
                  key={c.comment_id}
                  comment={c}
                  index={i}
                  onReact={() => handleReact(c)}
                  onDelete={() => handleDelete(c.comment_id)}
                />
              ))}
            </ul>
          )}
        </div>

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
            disabled={sending}
            className="flex-1 rounded-full bg-surface-2 px-4 py-2.5 font-nunito text-[13px] text-ink placeholder:text-faint focus:outline-none disabled:opacity-60 dark:bg-white/10 dark:text-white"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sending}
            aria-label="Send comment"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            {/* Same two-stage moment as CommentComposer's send button: the
                icon launches away like it's just been sent, a spinning ring
                covers the wait, then the icon springs back in on success. */}
            <span className="relative flex h-4 w-4 items-center justify-center">
              <AnimatePresence initial={false}>
                {sending ? (
                  <motion.span
                    key="spinner"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.3, rotate: -90 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.4 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  >
                    <motion.svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, ease: "linear", duration: 0.7 }}
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray="34 100"
                      />
                    </motion.svg>
                  </motion.span>
                ) : (
                  <motion.span
                    key="icon"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.4, x: -10, y: 10, rotate: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, x: 14, y: -14, rotate: 20 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                  >
                    <SendIconFill className="h-4 w-4" weight="duotone" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
