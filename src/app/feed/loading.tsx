"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Wordmark } from "@/components/brand/Wordmark";
import { FeedGistCardSkeleton } from "@/components/gist/FeedGistCardSkeleton";
import { CommentPanelSkeleton } from "@/components/comment/CommentPanelSkeleton";
import { Plus } from "@/components/ui/icons";
import { getFreshFeedSnapshot } from "@/stores/gistStore";
import { FeedContent, SKELETON_VARIANTS } from "./FeedContent";

/**
 * The server round-trip behind this route (gateServer + fetchFeedGists,
 * both genuinely per-viewer — campus filtering, "seen" ranking — so neither
 * is meaningfully cacheable) always takes several seconds regardless of
 * `staleTimes`; that setting only ever covered a cacheable shell above the
 * loading boundary, and this page has nothing above it to cache. But when
 * FeedContent already has a fresh feedSnapshot (see gistStore's own
 * docstring — saved the moment you last left the feed, e.g. to check a
 * profile), that server round-trip's result gets thrown away anyway in
 * favor of the snapshot. So: if a fresh snapshot exists, skip the generic
 * skeleton and render the REAL, already-restored feed immediately —
 * FeedContent detects and restores from the exact same snapshot on its own
 * (initialGists is only ever a fallback for when there's nothing to
 * restore, so an empty array here is safe). The real server-rendered
 * FeedContent still lands a few seconds later and replaces this one
 * (Suspense resolving) — since it restores from that same still-valid
 * snapshot too, it settles on the same gist/position, so that swap should
 * be near-invisible rather than another jump. Only genuinely fresh visits
 * (no snapshot at all) fall through to the plain skeleton below.
 */
export default function Loading() {
  const [hasFreshSnapshot] = useState(() => !!getFreshFeedSnapshot());
  if (hasFreshSnapshot) {
    return <FeedContent initialGists={[]} />;
  }
  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden">
        <div className="relative flex h-full min-w-0 flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]">
          {/* Same safe-area top padding as the real feed header (see
              FeedContent.tsx) — the skeleton has to sit in the identical
              box or the swap to the hydrated feed visibly jumps. */}
          <header className="sticky top-0 z-20 w-full shrink-0 border-b border-line bg-surface/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
            <div className="mx-auto grid max-w-[740px] grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 md:py-2.5">
              <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center justify-self-start overflow-hidden rounded-full bg-line/50 ring-1 ring-line" />
              <Wordmark accentClassName="text-brand" className="justify-self-center text-lg sm:text-xl" />
              {/* Desktop only, matching FeedContent's own real header — see
                  its doc on why mobile gets FloatingComposeButton (a
                  bottom-right FAB) instead. A static placeholder circle
                  below stands in for it here so the skeleton->real swap
                  doesn't jump the button from one corner to the other. */}
              <div className="hidden h-9 w-9 shrink-0 items-center justify-center justify-self-end rounded-full bg-brand text-white shadow-sm shadow-brand/30 md:flex">
                <Plus className="h-4 w-4" />
              </div>
            </div>
            <div className="mx-auto flex max-w-[740px] items-center px-4 pb-2.5 pt-1 sm:px-6">
              <div className="inline-flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="inline-flex min-w-[60px] shrink-0 items-center justify-center rounded-full bg-brand px-4 py-1.5 text-center font-nunito text-[14px] font-semibold text-white shadow-sm shadow-brand/30">
                  Gist
                </span>
                <span className="inline-flex min-w-[60px] shrink-0 items-center justify-center rounded-full bg-brand/[0.06] px-4 py-1.5 text-center font-nunito text-[14px] font-medium text-faint ring-1 ring-line/50">
                  Amebo
                </span>
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col items-center pb-0 pt-3 sm:pt-4 md:pb-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 opacity-100 dark:opacity-90 dark:invert"
              style={{
                backgroundImage: "url('/brand/doodles.svg')",
                backgroundRepeat: "repeat",
                backgroundSize: "280px auto",
              }}
            />
            <div className="relative z-10 flex min-h-0 flex-1 w-full flex-col">
              {/* Vertical stack of the real feed card's own skeleton — this
                  used to be a single full-height GistCardSkeleton (the old
                  swipeable single-card stack's own loading state), left
                  stale after the feed became a vertical list. Matches
                  FeedContent's own `loading` branch markup so the swap from
                  this route-level fallback to the real, hydrated page is
                  as close to invisible as possible. */}
              <div className="flex min-h-0 w-full flex-1 justify-center overflow-y-auto px-4 pb-8 pt-1">
                <div className="w-full max-w-[740px] space-y-3">
                  {SKELETON_VARIANTS.map((variant, i) => (
                    <FeedGistCardSkeleton key={i} variant={variant} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile-only static stand-in for FloatingComposeButton — no idle
            animation here (this skeleton is gone in a couple seconds, not
            worth animating), just matching position/size so the swap to
            the real, animated FAB doesn't jump. */}
        <div
          aria-hidden
          className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 md:hidden"
        >
          <Plus className="h-6 w-6" />
        </div>

        <CommentPanelSkeleton />
      </div>
    </AppShell>
  );
}
