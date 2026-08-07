"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart, SendIconFill, RefreshCw } from "@/components/ui/icons";
import { Illustration } from "@/components/brand/illustrations";
import { Avatar } from "@/components/ui/Avatar";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { timeAgo } from "@/lib/format";
import { LIMITS } from "@/lib/brand";
import { stripInvisibleChars, sanitizeForSubmit } from "@/lib/sanitize";
import { apiErrorMessage } from "@/lib/api";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import type { Comment, Gist } from "@/types";

// Only surface a count once someone's actually closing in on the ceiling —
// a persistent decrementing number on every reply is more noise than a
// secondary composer like this needs (unlike the main gist composer, where
// it's the primary content flow and always shown).
const COMMENT_WARN_THRESHOLD = 20;

/**
 * Loading placeholder shaped like a real comment bubble (tail, avatar,
 * name/handle, time/course, body lines) so the panel previews "comments are
 * coming" instead of generic pulsing blocks.
 */
function CommentSkeletonItem({ short }: { short?: boolean }) {
  return (
    <li className="relative ml-3 animate-pulse">
      <svg
        className="absolute -left-3 top-0 h-4 w-3 text-surface-2 dark:text-[#2B3B5A]"
        viewBox="0 0 12 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0H0L12 16V0Z" />
      </svg>
      <div className="relative rounded-2xl rounded-tl-none bg-surface-2 p-4 dark:bg-[#2B3B5A]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-black/10 dark:bg-white/15" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-20 rounded-full bg-black/10 dark:bg-white/15" />
              <div className="h-2.5 w-16 rounded-full bg-black/[0.06] dark:bg-white/10" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="h-2.5 w-10 rounded-full bg-black/10 dark:bg-white/15" />
            <div className="h-2.5 w-14 rounded-full bg-black/[0.06] dark:bg-white/10" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded-full bg-black/[0.06] dark:bg-white/10" />
          {!short && <div className="h-3 w-3/4 rounded-full bg-black/[0.06] dark:bg-white/10" />}
        </div>
      </div>
    </li>
  );
}

const COMMENT_TRUNCATE_LENGTH = 200;

/** Collapses long comment bodies behind a "...more" toggle so one wall of
 * text can't push the rest of the thread out of view. */
function CommentBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COMMENT_TRUNCATE_LENGTH;
  const shown = expanded || !isLong ? text : text.slice(0, COMMENT_TRUNCATE_LENGTH).trimEnd();

  return (
    <p className="break-words font-poppins text-sm leading-relaxed text-ink/90 dark:text-white/90">
      {shown}
      {isLong && !expanded && "… "}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-poppins text-sm font-semibold text-brand-accent hover:underline"
        >
          {expanded ? " less" : "more"}
        </button>
      )}
    </p>
  );
}

/**
 * One comment bubble — its own component (not inline in the .map) so it can
 * own its entrance animation without replaying it on unrelated re-renders:
 * framer-motion's `initial` only plays once per mounted instance, keyed by
 * `comment.comment_id`, so an already-visible bubble never re-animates just
 * because e.g. another comment arrived elsewhere in the list.
 */
function CommentBubble({
  comment: c,
  index,
  highlighted,
  onReact,
}: {
  comment: Comment;
  /** Position in the currently-loaded list — staggers the entrance so a
   * freshly-loaded thread pops in bubble by bubble instead of all at once.
   * Capped below so a long list (or one appended via load-more) doesn't
   * queue up a multi-second wait before the last items show. */
  index: number;
  /** True for ~2.5s right after arriving via a live WS broadcast (not your
   * own post) — a brief highlight distinct from the entrance animation
   * every new bubble gets regardless of source. */
  highlighted: boolean;
  onReact: () => void;
}) {
  const reacted = !!c.my_reaction;
  const avitag = useAuthStore((s) => s.avitag);
  const isOwn = c.avitag === avitag;
  const displayName = c.first_name ?? null;
  // Only student profiles have campus/major — a non-student commenter (or
  // one who hasn't set these) just shows whichever piece is actually there.
  const schoolInfo = [c.major_tag, c.campus_tag].filter(Boolean).join(" ");
  return (
    <motion.li
      className="relative ml-3 rounded-2xl"
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.4), ease: "easeOut" }}
    >
      {/* Chat bubble tail */}
      <svg
        className="absolute -left-3 top-0 h-4 w-3 text-surface-2 dark:text-[#2B3B5A]"
        viewBox="0 0 12 16"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0H0L12 16V0Z" />
      </svg>

      <motion.div
        className="relative rounded-2xl rounded-tl-none bg-surface-2 p-4 text-ink shadow-sm dark:bg-[#2B3B5A] dark:text-white"
        animate={highlighted ? { backgroundColor: "var(--color-brand-tint)" } : {}}
        transition={{ duration: 0.8 }}
      >
        {/* Header row */}
        <div className="flex items-start justify-between">
          {/* Left side: Avatar + Names */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light">
              <Avatar src={c.image_url} />
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 font-poppins text-sm font-semibold">
                {displayName ?? (c.avitag ? c.avitag.replace(/_?\d+$/, "") : "Fola_shade")}
                {isOwn && (
                  <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-poppins text-[10px] font-bold leading-none text-brand">
                    You
                  </span>
                )}
              </span>
              <span className="font-poppins text-xs text-muted dark:text-white/70">{c.avitag ?? "someone"}</span>
            </div>
          </div>

          {/* Right side: Time + Major Campus */}
          <div className="flex flex-col items-end">
            <span className="font-poppins text-xs text-ink/80 dark:text-white/90">{timeAgo(c.commented_at)}</span>
            {schoolInfo && (
              <span className="mt-1 font-poppins text-xs uppercase tracking-wide text-muted dark:text-white/70">
                {schoolInfo}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="mt-4">
          <CommentBody text={c.text} />
        </div>

        {/* React — a lighter single tap-to-like than the gist's full 5-emoji
            row; tapping toggles it on/off (see handleCommentReact), same as
            gist reactions already do. */}
        <button
          type="button"
          onClick={onReact}
          aria-label={reacted ? "Remove reaction" : "React"}
          className="mt-2 flex items-center gap-1 rounded-full py-0.5 pr-1 transition active:scale-90"
        >
          <motion.span
            className="flex"
            animate={reacted ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <Heart
              fill={reacted ? "currentColor" : "none"}
              className={`h-3.5 w-3.5 transition ${
                reacted ? "text-brand" : "text-muted dark:text-white/60"
              }`}
            />
          </motion.span>
          {!!c.reactions_count && (
            <span
              className={`font-poppins text-[11px] ${
                reacted ? "text-brand" : "text-muted dark:text-white/60"
              }`}
            >
              {c.reactions_count}
            </span>
          )}
        </button>
      </motion.div>
    </motion.li>
  );
}

/** Side-panel comment thread for a gist. Loads on mount, posts inline. */
export function CommentPanel({ gist }: { gist: Gist | undefined }) {
  const {
    itemsByGist,
    errorByGist,
    loadingMoreByGist,
    recentlyLiveIds,
    listByGist,
    loadMoreByGist,
    create,
    reactComment,
    unreactComment,
  } = useCommentStore();
  // Keyed by gist_id so an in-progress draft belongs to the gist it was
  // written for — switching gists shows that gist's own (possibly empty)
  // draft instead of leaking whatever was being typed for the last one.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [reactError, setReactError] = useState<string>();
  const [sendError, setSendError] = useState<string>();
  const text = (gist?.gist_id && drafts[gist.gist_id]) || "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const items: Comment[] = (gist?.gist_id && itemsByGist[gist.gist_id]) || [];
  const cached = !!(gist?.gist_id && itemsByGist[gist.gist_id]);
  // A real fetch failure, not just "hasn't loaded yet" — only meaningful
  // while genuinely uncached; a later successful retry replaces `cached`
  // with real data, at which point this gist's stale error flag no longer
  // applies even if it hasn't been explicitly cleared yet.
  const hasError = !cached && !!(gist?.gist_id && errorByGist[gist.gist_id]);
  // Deliberately NOT keyed off loadingByGist: that flag only flips to true
  // inside the effect below, one render after a gist switch — checking it
  // here would leave a one-frame gap (not cached yet, not "loading" yet)
  // where this reads as "confirmed zero comments" and flashes the empty
  // state before the skeleton catches up. `!cached` alone has no such gap —
  // it's already correct on the very first render after switching gists.
  // Excludes `hasError` so a failed fetch stops the skeleton instead of
  // spinning forever — it gets its own distinct retry state instead.
  const showSkeleton = (!gist?.gist_id || !cached) && !hasError;

  // Grows with the content (up to a sensible ceiling, then scrolls inside
  // itself) instead of staying a fixed 2 rows or freely expanding forever.
  const COMPOSER_MAX_HEIGHT = 160;

  // Custom scroll-position indicator, replacing the native scrollbar (hidden
  // via no-scrollbar) once the grown textarea hits its ceiling and starts
  // scrolling internally — same treatment as the gist composer.
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
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    updateScrollThumb();
  }, [text, updateScrollThumb]);

  useEffect(() => {
    // listByGist itself no-ops (returns the cached array) if this gist's
    // comments are already cached — from an earlier visit or a background
    // prefetch — so this is cheap to call on every gist switch.
    if (gist?.gist_id) {
      listByGist(gist.gist_id).catch(() => {});
    }
  }, [gist?.gist_id, listByGist]);

  const handleCommentReact = async (commentId: string, gistId: string, alreadyReacted: boolean) => {
    if (!requireAuth("react to comments")) return;
    try {
      if (alreadyReacted) await unreactComment(commentId, gistId);
      else await reactComment(commentId, gistId, "LOVE");
    } catch (err) {
      setReactError(apiErrorMessage(err, "Failed to react — try again"));
    }
  };

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
      // (fine) but gave zero indication anything had gone wrong, so it just
      // looked like nothing happened when you hit send.
      setSendError(apiErrorMessage(err, "Failed to post comment — try again"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative h-full w-full border-l border-line bg-brand/[0.04] dark:border-white/10 dark:bg-brand-ink">
      <ErrorModal open={!!reactError} onClose={() => setReactError(undefined)} message={reactError} />
      <ErrorModal open={!!sendError} onClose={() => setSendError(undefined)} message={sendError} />
      {/* Same tiled doodle as the feed body, so the panel doesn't feel like a
          bare, disconnected surface next to it — inverted to light strokes
          against the dark panel, normal ink against the light one. Pure
          Tailwind dark: variants throughout this file (not a JS-computed
          value from the theme store) so the swap is an instant CSS class
          flip on <html>, same as the feed, not a React re-render. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-90 dark:opacity-80 dark:invert"
        style={{
          backgroundImage: "url('/brand/doodles.svg')",
          backgroundRepeat: "repeat",
          backgroundSize: "220px auto",
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
        {/* Header */}
        <div className="relative flex items-center justify-center border-b border-line bg-brand/[0.04] px-5 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
          <span className="font-poppins text-sm font-medium text-ink dark:text-white">
            {items.length} {items.length === 1 ? "Comment" : "Comments"}
          </span>
        </div>

      {/* List */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 no-scrollbar"
        onScroll={(e) => {
          const gistId = gist?.gist_id;
          if (!gistId) return;
          const el = e.currentTarget;
          // Within ~150px of the bottom — fetch the next page before
          // someone actually hits the end, not after.
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
            void loadMoreByGist(gistId);
          }
        }}
      >
        {showSkeleton ? (
          <ul className="space-y-4 py-4 pr-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <CommentSkeletonItem key={i} short={i % 2 === 1} />
            ))}
          </ul>
        ) : hasError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="h-8 w-8 text-muted" />
            <p className="font-poppins text-sm font-semibold text-muted dark:text-white/80">
              Abeg we no fit load comments — check your connection.
            </p>
            <button
              type="button"
              onClick={() => gist?.gist_id && listByGist(gist.gist_id, {}, { force: true })}
              className="rounded-full bg-brand px-4 py-1.5 font-poppins text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Illustration name="Commentmodal" className="h-28 w-auto opacity-80" />
            <p className="font-poppins text-sm font-semibold text-muted dark:text-white/80">
              Nobody don talk yet, Talk your own na!
            </p>
          </div>
        ) : (
          <ul className="space-y-4 py-4 pr-2">
            {items.map((c, i) => (
              <CommentBubble
                key={c.comment_id}
                comment={c}
                index={i}
                highlighted={!!recentlyLiveIds[c.comment_id]}
                onReact={() =>
                  gist?.gist_id && handleCommentReact(c.comment_id, gist.gist_id, !!c.my_reaction)
                }
              />
            ))}
            {gist?.gist_id && loadingMoreByGist[gist.gist_id] && (
              <li className="flex justify-center py-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-line bg-brand/[0.04] p-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
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
            rows={2}
            style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
            className="w-full resize-none overflow-y-auto rounded-2xl bg-brand/[0.07] px-4 py-3 pr-14 font-poppins text-sm text-ink outline-none ring-1 ring-transparent transition placeholder:text-muted focus:bg-brand/[0.11] focus:ring-brand/25 disabled:opacity-50 no-scrollbar dark:bg-white/10 dark:text-white dark:placeholder:text-white/40 dark:focus:bg-white/[0.14] dark:focus:ring-white/20"
          />
          {/* Sleeker stand-in for the native scrollbar (hidden via
              no-scrollbar) — same idea as the gist composer, just tucked
              left of the char-count corner so they never overlap. */}
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
      </div>
    </div>
  );
}
