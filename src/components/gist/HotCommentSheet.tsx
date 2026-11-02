"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Linkify, linkifyAsHighlightSpans } from "@/components/ui/Linkify";
import { X, RefreshCw, SendIconFill, Heart, DeleteIconFill } from "@/components/ui/icons";
import { ConfirmModal, ErrorModal } from "@/components/ui/FeedbackModal";
import { useHotStore, type HotComment } from "@/stores/hotStore";
import { useAuthStore, useIsAdmin } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { gistColorFor } from "@/lib/brand";
import { playSound } from "@/lib/sounds";

const COMMENT_MAX_LEN = 500;
const COMMENT_TRUNCATE_LENGTH = 200;

/** Collapses long comment bodies behind a "...more" toggle — same
 * treatment/threshold as SpotCommentSheet's own SpotCommentBody, copied
 * rather than shared for the same "not quite the same component" reasoning
 * that file's own doc comment gives. */
function HotCommentBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COMMENT_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? text : text.slice(0, COMMENT_TRUNCATE_LENGTH).trimEnd();
  return (
    <p className="whitespace-pre-wrap break-words font-nunito text-sm leading-relaxed text-white/85">
      <Linkify text={shown} />
      {isLong && !expanded && "… "}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-nunito text-sm font-semibold text-[var(--hot-c)] hover:underline"
        >
          {expanded ? " less" : "more"}
        </button>
      )}
    </p>
  );
}

/** Loading placeholder, forced dark regardless of the SITE's own light/
 * dark toggle — unlike CommentList's own CommentSkeletonItem (which only
 * goes dark when `.dark` is on `<html>`), the Hot sheet is dark no matter
 * what the rest of the app is doing right now, so this is its own small
 * copy with hardcoded colors instead of a `dark:` variant. */
function HotCommentSkeletonItem({ short }: { short?: boolean }) {
  return (
    <li className="relative ml-3 animate-pulse">
      <svg className="absolute -left-3 top-0 h-4 w-3 text-[#1f2026]" viewBox="0 0 12 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0H0L12 16V0Z" />
      </svg>
      <div className="relative rounded-2xl rounded-tl-none bg-[#1f2026] p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-20 rounded-full bg-white/10" />
              <div className="h-2.5 w-16 rounded-full bg-white/[0.06]" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="h-2.5 w-10 rounded-full bg-white/10" />
            <div className="h-2.5 w-14 rounded-full bg-white/[0.06]" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded-full bg-white/[0.06]" />
          {!short && <div className="h-3 w-3/4 rounded-full bg-white/[0.06]" />}
        </div>
      </div>
    </li>
  );
}

/** A single comment bubble — same chat-bubble shape, staggered pop-in
 * entrance, tap-to-like row, and own/admin delete as Spot/Gist's own
 * comment bubble. */
function HotCommentBubble({
  comment: c,
  index,
  onReact,
  onDelete,
}: {
  comment: HotComment;
  index: number;
  onReact: () => void;
  /** Resolves/rejects with the real delete outcome — HotCommentSheet's own
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
    playSound("delete");
    try {
      await onDelete();
      setShowDeleteConfirm(false);
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
        className="absolute -left-3 top-0 h-4 w-3 text-[#1f2026]"
        viewBox="0 0 12 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0H0L12 16V0Z" />
      </svg>
      <div className="relative rounded-2xl rounded-tl-none border border-white/[0.06] bg-[#1f2026] p-4 text-white shadow-sm">
        <div className="flex items-start justify-between">
          <Link href={`/${c.avitag}`} className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-extrabold text-white ring-1 ring-white/15"
              style={{ backgroundColor: avatarColor }}
            >
              {c.image_url ? <Avatar src={c.image_url} /> : c.avitag.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 font-nunito text-sm font-semibold text-white">
                {c.first_name ?? c.avitag.replace(/_?\d+$/, "")}
                {isOwn && (
                  <span className="shrink-0 rounded-full bg-[var(--hot-c)]/15 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-[var(--hot-c)]">
                    You
                  </span>
                )}
              </span>
              <span className="font-nunito text-xs text-white/55">{c.avitag}</span>
            </div>
          </Link>
          <div className="flex flex-col items-end">
            <span className="font-nunito text-xs text-white/70">{timeAgo(c.commented_at)}</span>
            {schoolInfo && (
              <span className="mt-1 font-nunito text-xs uppercase tracking-wide text-white/50">
                {schoolInfo}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4">
          <HotCommentBody text={c.text} />
        </div>
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
                  reacted ? "text-[var(--hot-c)]" : "text-white/45"
                }`}
              />
            </motion.span>
            {!!c.reactions_count && (
              <span
                className={`font-nunito text-xs ${
                  reacted ? "text-[var(--hot-c)]" : "text-white/45"
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
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/15 active:scale-90"
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
          title={isOwn ? "Delete your comment?" : `Delete ${c.avitag}'s comment?`}
          message={isOwn ? "This can't be undone." : "This can't be undone — you're deleting this as an admin."}
          confirmLabel="Delete"
          icon={<DeleteIconFill size={26} weight="fill" />}
        />
      )}
    </motion.li>
  );
}

/**
 * Hot post's own comment surface — same loading skeleton, empty state,
 * bubble shape/entrance animation, tap-to-like, own/admin delete, and
 * animated send button as Spot/Gist's own comment sheet. A Hot post's
 * comments live exactly as long as the post itself (hot_post_comments is
 * FK'd ON DELETE CASCADE — see migration 0066's own doc comment), so
 * there's nothing extra for this sheet to do about the 24h disappearance;
 * it just stops being reachable once the post itself is gone.
 */
export function HotCommentSheet({
  open,
  onClose,
  hotPostId,
  commentCount,
}: {
  open: boolean;
  onClose: () => void;
  hotPostId: string | null;
  commentCount: number;
}) {
  const commentsByHotPost = useHotStore((s) => s.commentsByHotPost);
  const errorByHotPost = useHotStore((s) => s.commentsErrorByHotPost);
  const fetchComments = useHotStore((s) => s.fetchComments);
  const addComment = useHotStore((s) => s.addComment);
  const reactComment = useHotStore((s) => s.reactComment);
  const unreactComment = useHotStore((s) => s.unreactComment);
  const removeComment = useHotStore((s) => s.removeComment);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const commentInputOverlayRef = useRef<HTMLDivElement>(null);

  const items = (hotPostId && commentsByHotPost[hotPostId]) || [];
  // Genuinely fetched (even to zero results), not just "hasn't loaded yet"
  // — same distinction SpotCommentSheet's own `cached` draws.
  const cached = !!(hotPostId && hotPostId in commentsByHotPost);
  const hasError = !cached && !!(hotPostId && errorByHotPost[hotPostId]);
  const showSkeleton = (!hotPostId || !cached) && !hasError;

  useEffect(() => {
    if (open && hotPostId) void fetchComments(hotPostId);
  }, [open, hotPostId, fetchComments]);

  useEffect(() => {
    if (!open) {
      setText("");
      setSendError(undefined);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !hotPostId || sending) return;
    if (!requireAuth("leave a comment")) return;
    setSending(true);
    setSendError(undefined);
    playSound("whoosh");
    try {
      await addComment(hotPostId, trimmed);
      setText("");
    } catch (err) {
      setSendError(apiErrorMessage(err, "Failed to post comment — try again"));
    } finally {
      setSending(false);
    }
  };

  const handleReact = (comment: HotComment) => {
    if (!requireAuth("react to comments")) return;
    if (!hotPostId) return;
    // Same reasoning Spot's own handleReact guard gives: this comment
    // doesn't have a real id on the server yet (still-pending optimistic
    // placeholder), so reacting to it right now would just 404.
    if (comment.comment_id.startsWith("offline-")) return;
    if (comment.my_reaction) void unreactComment(hotPostId, comment.comment_id);
    else {
      void reactComment(hotPostId, comment.comment_id);
      playSound("pop");
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!hotPostId) throw new Error("Missing hot post");
    try {
      await removeComment(hotPostId, commentId);
    } catch (err) {
      setSendError(apiErrorMessage(err, "Failed to delete comment"));
      throw err;
    }
  };

  return (
    <Modal open={open} onClose={onClose} variant="sheet">
      {/* Dark, fire-branded — this is Hot's own comment sheet, never the
          plain white/blue panel gist/Spot comments use. No light/dark
          variants needed: the Hot viewer itself is always dark (a story
          format, no theme toggle), so these colors are hardcoded rather
          than drawn from the light-mode-first --kp-* tokens the rest of
          the app uses. var(--hot-c) (gold) is reserved for ACTIVE states
          only (your own tag, a liked comment, the send button) — same
          rule the viewer's own reaction heart and rank pill already
          follow, never just decoration. */}
      <div className="flex h-[80dvh] flex-col overflow-hidden rounded-t-[2.5rem] bg-[#15161a]">
        <div className="relative flex shrink-0 items-center justify-center border-b border-white/[0.08] px-5 py-4">
          {commentCount > 0 && (
            <span className="font-nunito text-sm font-medium text-white">
              {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 rounded-full p-1 text-white/70 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 no-scrollbar">
          <ErrorModal open={!!sendError} onClose={() => setSendError(undefined)} message={sendError} />
          {showSkeleton ? (
            <ul className="space-y-4 py-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <HotCommentSkeletonItem key={i} short={i % 2 === 1} />
              ))}
            </ul>
          ) : hasError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="h-8 w-8 text-white/60" />
              <p className="font-nunito text-sm font-semibold text-white/80">
                Abeg we no fit load comments — check your connection.
              </p>
              <button
                type="button"
                onClick={() => hotPostId && fetchComments(hotPostId)}
                className="rounded-full bg-[var(--hot-c)] px-4 py-1.5 font-nunito text-sm font-semibold text-[#15161a] transition active:scale-95"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            // Not the shared Illustration component here — that asset is
            // drawn for a light surface, and the Hot sheet is always dark
            // (see this file's own top-level doc comment on why). A plain
            // flame reads as Hot's own empty state instead of risking a
            // mismatched light-mode graphic on a dark background.
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl" aria-hidden>
                🔥
              </span>
              <p className="font-nunito text-sm font-semibold text-white/80">
                Nobody don talk yet, Talk your own na!
              </p>
            </div>
          ) : (
            <ul className="space-y-4 py-1">
              {items.map((c, i) => (
                <HotCommentBubble
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

        <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.08] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="relative flex-1">
            <div
              aria-hidden="true"
              ref={commentInputOverlayRef}
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-nowrap rounded-full px-4 py-2.5 font-nunito text-[13px] text-white"
            >
              {linkifyAsHighlightSpans(text)}
            </div>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX_LEN))}
              onScroll={(e) => {
                if (commentInputOverlayRef.current) {
                  commentInputOverlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Add a comment…"
              disabled={sending}
              className="w-full rounded-full bg-white/10 px-4 py-2.5 font-nunito text-[13px] text-transparent caret-white placeholder:text-white/40 focus:outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sending}
            aria-label="Send comment"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--hot-c)] text-[#15161a] shadow-sm shadow-black/40 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
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
