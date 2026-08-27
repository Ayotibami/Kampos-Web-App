"use client";

import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";
import { useCommentStore } from "@/stores/commentStore";
import type { Gist } from "@/types";

/** Side-panel comment thread for a gist (desktop). Loads on mount, posts
 * inline. The actual list/bubbles/skeleton live in CommentList, and the
 * input in CommentComposer — both shared with CommentSheet's mobile
 * bottom-sheet equivalent, so the two never drift into two different
 * comment experiences. */
export function CommentPanel({ gist }: { gist: Gist | undefined }) {
  const itemsByGist = useCommentStore((s) => s.itemsByGist);
  const errorByGist = useCommentStore((s) => s.errorByGist);
  const items = (gist?.gist_id && itemsByGist[gist.gist_id]) || [];
  // Same reasoning as CommentSheet's own commentCount — the gist's real
  // backend total, not just how many comments happen to be loaded so far.
  const commentCount = gist?.counts?.comments_count ?? items.length;
  // Same distinction CommentList draws internally (see its own hasError):
  // cached means a real fetch actually resolved for this gist, so a bare
  // `items.length === 0` can't be trusted as "truly empty" while a fetch is
  // still in flight — that would hide the doodle during the loading
  // skeleton too, not just the empty/error states this is actually for.
  const cached = !!(gist?.gist_id && itemsByGist[gist.gist_id]);
  const hasError = !cached && !!(gist?.gist_id && errorByGist[gist.gist_id]);
  const isEmpty = cached && items.length === 0;

  return (
    <div className="relative h-full w-full border-l border-line bg-brand/[0.04] dark:border-white/10 dark:bg-brand-ink">
      {/* Same tiled doodle as the feed body, so the panel doesn't feel like a
          bare, disconnected surface next to it — inverted to light strokes
          against the dark panel, normal ink against the light one. Pure
          Tailwind dark: variants throughout this file (not a JS-computed
          value from the theme store) so the swap is an instant CSS class
          flip on <html>, same as the feed, not a React re-render. Skipped
          entirely once comments are known to be empty or failed to load —
          CommentList's own empty/error states already have their own
          illustration/copy centered in that same space, and the doodle
          behind them read as visual noise competing with it. */}
      {!hasError && !isEmpty && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-90 dark:opacity-80 dark:invert"
          style={{
            backgroundImage: "url('/brand/doodles.svg')",
            backgroundRepeat: "repeat",
            backgroundSize: "220px auto",
          }}
        />
      )}

      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
        {/* Header */}
        <div className="relative flex items-center justify-center border-b border-line bg-brand/[0.04] px-5 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
          <span className="font-nunito text-sm font-medium text-ink dark:text-white">
            {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
          </span>
        </div>

        <CommentList gist={gist} className="px-5" />

        <CommentComposer
          gist={gist}
          className="items-end border-t border-line bg-brand/[0.04] p-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85"
        />
      </div>
    </div>
  );
}
