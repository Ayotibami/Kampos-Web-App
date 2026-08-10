"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SendIconFill } from "@/components/ui/icons";
import { useCommentStore } from "@/stores/commentStore";
import { requireAuth } from "@/lib/requireAuth";
import { LIMITS } from "@/lib/brand";
import { stripInvisibleChars, sanitizeForSubmit } from "@/lib/sanitize";
import { apiErrorMessage } from "@/lib/api";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import type { Gist } from "@/types";

const COMMENT_WARN_THRESHOLD = 20;
// Grows with the content (up to a sensible ceiling, then scrolls inside
// itself) instead of staying a fixed row count or freely expanding forever.
const COMPOSER_MAX_HEIGHT = 160;

/**
 * The comment-input row alone — pulled out of CommentPanel so it can also
 * render standalone. Desktop keeps the full CommentPanel (list + this) in
 * its side pane; mobile has no room for a whole scrollable thread beside
 * the gist card, so it gets just this — a compact input stacked below the
 * card instead (see FeedContent's mobile layout).
 */
export function CommentComposer({
  gist,
  className = "",
  autoFocus = false,
}: {
  gist: Gist | undefined;
  className?: string;
  /** Focuses the textarea the moment this mounts — used by CommentSheet,
   * which only ever mounts this while its modal is actually open, so
   * "on mount" and "sheet just opened" are the same moment. */
  autoFocus?: boolean;
}) {
  const create = useCommentStore((s) => s.create);
  // Keyed by gist_id, same reasoning as CommentPanel's own drafts — an
  // in-progress draft belongs to the gist it was written for, so swiping
  // to a different card shows that gist's own (possibly empty) draft
  // instead of leaking whatever was being typed for the last one.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const text = (gist?.gist_id && drafts[gist.gist_id]) || "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Custom scroll-position indicator, replacing the native scrollbar (hidden
  // via no-scrollbar) once the grown textarea hits its ceiling and starts
  // scrolling internally.
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);
  const updateScrollThumb = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      setScrollThumb(null);
      return;
    }
    const heightFrac = el.clientHeight / el.scrollHeight;
    const topFrac = el.scrollTop / el.scrollHeight;
    setScrollThumb({ top: topFrac * 100, height: heightFrac * 100 });
  }, []);

  useEffect(() => {
    // Only ever mounts once the sheet is actually open (Modal fully
    // unmounts its children on close, see Modal.tsx), so "on mount" and
    // "sheet just opened" are the same moment — no need to key this off
    // anything else.
    if (autoFocus) textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    updateScrollThumb();
  }, [text, updateScrollThumb]);

  const send = async () => {
    const gistId = gist?.gist_id;
    const clean = sanitizeForSubmit(text);
    if (!clean || !gistId) return;
    if (!requireAuth("leave a comment")) return;
    setSending(true);
    try {
      await create({ gist_id: gistId, text: clean });
      setDrafts((prev) => ({ ...prev, [gistId]: "" }));
    } catch (err) {
      // Previously silently ignored — a failed send left the draft intact
      // (fine) but gave zero indication anything had gone wrong, so it
      // just looked like nothing happened when you hit send.
      setSendError(apiErrorMessage(err, "Failed to post comment — try again"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <ErrorModal open={!!sendError} onClose={() => setSendError(undefined)} message={sendError} />
      <div className="relative flex-1">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            const gistId = gist?.gist_id;
            if (!gistId) return;
            const value = stripInvisibleChars(e.target.value).slice(0, LIMITS.comment);
            setDrafts((prev) => ({ ...prev, [gistId]: value }));
          }}
          onScroll={updateScrollThumb}
          placeholder="Talk your own..."
          disabled={!gist}
          rows={1}
          style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
          className="w-full resize-none overflow-y-auto rounded-3xl border-0 bg-[#A9C9F85C] px-4 py-3 pr-14 font-poppins text-sm text-ink outline-none transition placeholder:text-ink/50 focus:ring-2 focus:ring-brand/40 disabled:opacity-50 no-scrollbar dark:bg-white/10 dark:text-white dark:placeholder:text-white/40 dark:focus:bg-white/[0.14] dark:focus:ring-white/20"
        />
        {scrollThumb && (
          <div className="pointer-events-none absolute bottom-3 right-1.5 top-3 w-1 rounded-full bg-black/10 dark:bg-white/15">
            <div
              className="absolute w-full rounded-full bg-brand/60 dark:bg-white/50"
              style={{ top: `${scrollThumb.top}%`, height: `${scrollThumb.height}%` }}
            />
          </div>
        )}
        {LIMITS.comment - text.length <= COMMENT_WARN_THRESHOLD && (
          <span
            className="pointer-events-none absolute bottom-2.5 right-4 font-poppins text-[11px] tabular-nums"
            style={{ color: "var(--color-warning)" }}
          >
            {LIMITS.comment - text.length}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={!text.trim() || sending || !gist}
        aria-label="Send comment"
        className={`mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95 disabled:shadow-none disabled:active:scale-100 ${
          !sending && (!text.trim() || !gist) ? "opacity-40" : ""
        }`}
      >
        <motion.span
          className="flex"
          animate={sending ? { x: [0, 4, 0], y: [0, -2, 0] } : { x: 0, y: 0 }}
          transition={sending ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.15 }}
        >
          <SendIconFill className="h-5 w-5" weight="duotone" />
        </motion.span>
      </button>
    </div>
  );
}
