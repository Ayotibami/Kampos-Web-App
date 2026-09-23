"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSpotStore } from "@/stores/spotStore";
import { PlayIconFill, Heart } from "@/components/ui/icons";

// Same compact-count formatting VideoFeedContent's own rail uses — small
// enough (one place) that copying it here beats importing a private helper
// out of an unrelated screen's file.
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}k`;
  return String(n);
}

const SKELETON_COUNT = 9;

function GridCellSkeleton() {
  return <div className="aspect-square animate-pulse rounded-xl bg-line/40" />;
}

/**
 * A single tile — the thumbnail fills a rounded square (this app's own
 * "branded" take on Instagram's sharp-cornered grid, matching every other
 * media tile in the codebase, e.g. GistMediaGrid's own rounded corners),
 * with a heart + like-count pill bottom-left — real engagement, unlike a
 * raw view count (counts every pass-through, not a deliberate reaction) or
 * a play glyph (redundant here: every tile in this grid is already a
 * video, so marking it as one tells a visitor nothing new).
 */
function SpotGridCell({ spot, href }: { spot: { spot_id: string; thumbnail_url: string | null; reactions_count: number }; href: string }) {
  return (
    <Link
      href={href}
      className="group relative block aspect-square overflow-hidden rounded-xl bg-line/30 ring-1 ring-black/5 transition active:scale-[0.97] dark:ring-white/10"
    >
      {spot.thumbnail_url ? (
        // Same plain <img> GistMediaGrid/VideoCard already use for a
        // Cloudinary-hosted thumbnail — no next/image config for this
        // remote host exists here.
        <img
          src={spot.thumbnail_url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-active:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/20 to-brand/5">
          <PlayIconFill className="h-6 w-6 text-brand/50" weight="fill" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white">
        <Heart className="h-3 w-3 drop-shadow" fill="#fff" stroke="#fff" />
        <span className="font-nunito text-[10.5px] font-bold tabular-nums drop-shadow">
          {formatCount(spot.reactions_count)}
        </span>
      </div>
    </Link>
  );
}

/**
 * The Spot tab's own content on a profile page — an Instagram-style grid of
 * that avitag's posted Spots (own profile also sees its rejected/removed
 * history; see spotStore's fetchUserSpots doc). Tapping a tile opens the
 * full player at that clip, scoped to keep scrolling through THIS profile's
 * remaining Spots (VideoFeedContent's own "profile mode") — not the global
 * feed — with a back arrow (top-right there) that returns here, to the
 * grid, with the Spot tab still selected.
 *
 * Column count is the one thing that actually needs to react to real screen
 * size, not just this page's usual mobile/desktop split: 3 up on a phone,
 * 4 from a larger phone/small tablet (sm, 640px), 5 from a tablet/desktop
 * (lg, 1024px) — the same "most sensible for the width available" spread
 * Instagram's own grid settles into across device classes.
 */
export function ProfileSpotGrid({ avitag, isOwnProfile }: { avitag: string; isOwnProfile: boolean }) {
  const userSpots = useSpotStore((s) => s.userSpots);
  const userSpotsAvitag = useSpotStore((s) => s.userSpotsAvitag);
  const userSpotsTotal = useSpotStore((s) => s.userSpotsTotal);
  const userSpotsLoading = useSpotStore((s) => s.userSpotsLoading);
  const userSpotsLoadingMore = useSpotStore((s) => s.userSpotsLoadingMore);
  const userSpotsExhausted = useSpotStore((s) => s.userSpotsExhausted);
  const userSpotsError = useSpotStore((s) => s.userSpotsError);
  const fetchUserSpots = useSpotStore((s) => s.fetchUserSpots);
  const loadMoreUserSpots = useSpotStore((s) => s.loadMoreUserSpots);

  // Only this avitag's own fetch is "ours" — userSpots is a single shared
  // slice (also driving VideoFeedContent's profile-mode player), so a stale
  // previous profile's list (or one still loading) must never flash here.
  const isCurrent = userSpotsAvitag === avitag;
  const spots = isCurrent ? userSpots : [];
  const loading = !isCurrent || userSpotsLoading;
  const exhausted = isCurrent && userSpotsExhausted;

  useEffect(() => {
    if (userSpotsAvitag !== avitag) void fetchUserSpots(avitag);
  }, [avitag, userSpotsAvitag, fetchUserSpots]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(() => {
    if (isCurrent) void loadMoreUserSpots(avitag);
  }, [avitag, isCurrent, loadMoreUserSpots]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || exhausted) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, exhausted]);

  // Where a tapped tile's back arrow returns to — the Spot tab specifically,
  // not the plain profile URL (which would default back to Gist).
  const backHref = `/${avitag}?tab=spot`;

  if (loading && spots.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <GridCellSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (userSpotsError && spots.length === 0) {
    return <p className="py-8 text-center font-nunito text-sm text-danger">{userSpotsError}</p>;
  }

  if (spots.length === 0) {
    return (
      <p className="py-8 text-center font-nunito text-sm text-muted">
        {isOwnProfile ? "No Spots yet — drop your first one from the Spot tab." : "No Spots yet."}
      </p>
    );
  }

  return (
    // pb-28 (md:pb-0 — the bar itself is md:hidden, nothing to clear on
    // desktop): MobileTabBar floats as its own pill ~16px off the bottom
    // edge plus its own height, not a flush full-width bar docked to the
    // edge — without real clearance here the grid's last row scrolls in
    // right underneath it, same reasoning the video feed's own action rail
    // already sits at bottom-[104px] to stay clear of it.
    <div className="pb-28 md:pb-0">
      <p className="mb-3 font-nunito text-base font-bold text-ink md:text-lg">
        {userSpotsTotal} {userSpotsTotal === 1 ? "Spot" : "Spots"}
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
        {spots.map((spot) => (
          <SpotGridCell
            key={spot.spot_id}
            spot={spot}
            href={`/video?spot=${spot.spot_id}&user=${avitag}&back=${encodeURIComponent(backHref)}`}
          />
        ))}
      </div>
      {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
      {userSpotsLoadingMore && (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: Math.min(SKELETON_COUNT, 5) }).map((_, i) => (
            <GridCellSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
