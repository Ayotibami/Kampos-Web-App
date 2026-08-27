"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, RefreshCw } from "@/components/ui/icons";
import { Illustration } from "@/components/brand/illustrations";
import { Avatar } from "@/components/ui/Avatar";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore } from "@/stores/authStore";
import { requireAuth } from "@/lib/requireAuth";
import { timeAgo } from "@/lib/format";
import { apiErrorMessage } from "@/lib/api";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import type { Comment, Gist } from "@/types";

/**
 * Loading placeholder shaped like a real comment bubble (tail, avatar,
 * name/handle, time/course, body lines) so the list previews "comments are
 * coming" instead of generic pulsing blocks.
 */
/** Exported so route-level loading.tsx files (feed, profile) can build a
 * pixel-matching CommentPanel skeleton without duplicating this markup —
 * see CommentPanelSkeleton.tsx. */
export function CommentSkeletonItem({ short }: { short?: boolean }) {
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
          {/* Left side: Avatar + Names → the commenter's profile (falls back
              to a plain, non-clickable version for the rare case a comment
              has no avitag at all). */}
          {c.avitag ? (
            <Link href={`/${c.avitag}`} className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light">
                <Avatar src={c.image_url} />
              </div>
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 font-nunito text-sm font-semibold">
                  {displayName ?? c.avitag.replace(/_?\d+$/, "")}
                  {isOwn && (
                    <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-nunito text-[10px] font-bold leading-none text-brand">
                      You
                    </span>
                  )}
                </span>
                <span className="font-nunito text-xs text-muted dark:text-white/70">{c.avitag}</span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light">
                <Avatar src={c.image_url} />
              </div>
              <div className="flex flex-col">
                <span className="font-nunito text-sm font-semibold">{displayName ?? "Fola_shade"}</span>
                <span className="font-nunito text-xs text-muted dark:text-white/70">someone</span>
              </div>
            </div>
          )}

          {/* Right side: Time + Major Campus */}
          <div className="flex flex-col items-end">
            <span className="font-nunito text-xs text-ink/80 dark:text-white/90">{timeAgo(c.commented_at)}</span>
            {schoolInfo && (
              <span className="mt-1 font-nunito text-xs uppercase tracking-wide text-muted dark:text-white/70">
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
              className={`font-nunito text-[11px] ${
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

/**
 * The scrollable comment thread alone — skeleton/error/empty states, real
 * bubbles, tap-to-like, infinite scroll — pulled out of CommentPanel so the
 * exact same rendering can also power CommentSheet's mobile bottom sheet
 * instead of a separate, simplified re-implementation drifting out of sync
 * with the real desktop panel over time.
 */
export function CommentList({ gist, className = "" }: { gist: Gist | undefined; className?: string }) {
  const { itemsByGist, errorByGist, loadingMoreByGist, recentlyLiveIds, listByGist, loadMoreByGist, reactComment, unreactComment } =
    useCommentStore();
  const [reactError, setReactError] = useState<string>();

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
    // Same reasoning as GistCard's isPending guard on an offline-created
    // gist: this comment doesn't have a real id on the server yet (it's a
    // placeholder rebuilt from the offline queue — see commentStore's
    // buildOfflineComment), so a reaction against it right now would just
    // 404 against an id that doesn't exist anywhere but this tab.
    if (commentId.startsWith("offline-")) {
      setReactError("Still sending this comment — you can react to it once it's back online and synced.");
      return;
    }
    try {
      if (alreadyReacted) await unreactComment(commentId, gistId);
      else await reactComment(commentId, gistId, "LOVE");
    } catch (err) {
      setReactError(apiErrorMessage(err, "Failed to react — try again"));
    }
  };

  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto no-scrollbar ${className}`}
      onScroll={(e) => {
        const gistId = gist?.gist_id;
        if (!gistId) return;
        const el = e.currentTarget;
        // Within ~150px of the bottom — fetch the next page before someone
        // actually hits the end, not after.
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
          void loadMoreByGist(gistId);
        }
      }}
    >
      <ErrorModal open={!!reactError} onClose={() => setReactError(undefined)} message={reactError} />
      {showSkeleton ? (
        <ul className="space-y-4 py-4 pr-2">
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
            onClick={() => gist?.gist_id && listByGist(gist.gist_id, {}, { force: true })}
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
        <ul className="space-y-4 py-4 pr-2">
          {items.map((c, i) => (
            <CommentBubble
              key={c.comment_id}
              comment={c}
              index={i}
              highlighted={!!recentlyLiveIds[c.comment_id]}
              onReact={() => gist?.gist_id && handleCommentReact(c.comment_id, gist.gist_id, !!c.my_reaction)}
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
  );
}
