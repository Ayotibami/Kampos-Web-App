"use client";

import { Modal } from "@/components/ui/Modal";
import { X } from "@/components/ui/icons";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";
import { useCommentStore } from "@/stores/commentStore";
import type { Gist } from "@/types";

/**
 * Mobile's real comment surface — the compact row below the card on the
 * feed (see FeedContent) is just a button styled to look like an input; it
 * never actually gets typed into. Tapping it opens this instead: a bottom
 * sheet at ~80% viewport height, the exact same CommentList/CommentComposer
 * desktop's side panel uses (not a simplified re-implementation), with the
 * input pinned to the bottom and autofocused the moment the sheet opens.
 */
export function CommentSheet({
  open,
  onClose,
  gist,
  autoFocusInput = true,
}: {
  open: boolean;
  onClose: () => void;
  gist: Gist | undefined;
  /** The pill trigger (meant for typing) wants the input focused the
   * instant this opens; the icon/count trigger next to it (meant just for
   * viewing) doesn't — tapping it shouldn't yank the keyboard open. */
  autoFocusInput?: boolean;
}) {
  const itemsByGist = useCommentStore((s) => s.itemsByGist);
  const errorByGist = useCommentStore((s) => s.errorByGist);
  const items = (gist?.gist_id && itemsByGist[gist.gist_id]) || [];
  // The gist's own backend-authoritative total, not how many happen to be
  // loaded into the store yet — this list only ever loads one page (20) at
  // a time, so items.length alone under-counts the moment a gist has more
  // than that. Falls back to items.length only for a gist with no counts
  // yet at all (e.g. a freshly-created offline-queued gist).
  const commentCount = gist?.counts?.comments_count ?? items.length;
  // Same distinction CommentPanel draws (see its own comment) — cached
  // means a fetch actually resolved for this gist, so a bare
  // `items.length === 0` can't be trusted as "truly empty" while still loading.
  const cached = !!(gist?.gist_id && itemsByGist[gist.gist_id]);
  const hasError = !cached && !!(gist?.gist_id && errorByGist[gist.gist_id]);
  const isEmpty = cached && items.length === 0;

  return (
    <Modal open={open} onClose={onClose} variant="sheet">
      <div className="relative flex h-[80dvh] flex-col overflow-hidden rounded-t-[2.5rem] bg-surface dark:bg-brand-ink">
        {/* Same tiled doodle CommentPanel uses, for the same reason — this
            is meant to read as the same surface, not a stripped-down
            mobile substitute. Skipped once comments are known to be empty
            or failed to load, same as CommentPanel — the empty/error
            states' own illustration/copy shouldn't compete with it. */}
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
          {/* Header — the count only shows once there's at least one real
              comment (nothing worth announcing about zero), but unlike
              CommentPanel's purely informational bar, this one also holds
              the close button, so the bar itself always stays — mobile's
              only obvious way to dismiss the sheet. */}
          <div className="relative flex shrink-0 items-center justify-center border-b border-line bg-brand/[0.04] px-5 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
            {commentCount > 0 && (
              <span className="font-nunito text-sm font-medium text-ink dark:text-white">
                {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 rounded-full p-1 text-muted transition hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <CommentList gist={gist} className="px-5" />

          {/* Fixed at the bottom, autofocused the instant this mounts —
              this component only ever mounts while the sheet is actually
              open (Modal fully unmounts on close), so "on mount" is
              exactly "sheet just opened". */}
          <CommentComposer
            gist={gist}
            autoFocus={autoFocusInput}
            className="shrink-0 items-end border-t border-line bg-brand/[0.04] p-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85"
          />
        </div>
      </div>
    </Modal>
  );
}
