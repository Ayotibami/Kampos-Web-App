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
  const items = (gist?.gist_id && itemsByGist[gist.gist_id]) || [];

  return (
    <div className="relative h-full w-full border-l border-line bg-brand/[0.04] dark:border-white/10 dark:bg-brand-ink">
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

        <CommentList gist={gist} className="px-5" />

        <CommentComposer
          gist={gist}
          className="items-end border-t border-line bg-brand/[0.04] p-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85"
        />
      </div>
    </div>
  );
}
