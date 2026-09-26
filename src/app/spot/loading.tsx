"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { isSpotFeedFresh } from "@/stores/spotStore";
import { VideoFeedContent, VideoFeedSkeleton } from "./VideoFeedContent";

/**
 * Route-level fallback for /video — shown while VideoPage's own
 * gateServerForTabs() await is in flight, for BOTH a hard reload/direct URL
 * hit and (now that video/layout.tsx gives this route its own real
 * Suspense boundary) a client-side tab-bar navigation too.
 *
 * The global Spot feed already lives in spotStore, not component state, so
 * it never actually disappears on a previous /video unmount — the only
 * thing standing between a repeat visit and instant real content used to
 * be VideoFeedContent unconditionally re-fetching (and showing a loading
 * spinner) on every mount, fixed alongside this in VideoFeedContent's own
 * mount effect. So when the feed's still within SPOT_FEED_TTL_MS, skip the
 * skeleton entirely and render the real, already-populated feed right here
 * as the Suspense fallback itself — same trick [avitag]/loading.tsx and
 * feed/loading.tsx already use for their own snapshots. VideoFeedContent
 * re-checks freshness itself (see its mount effect) rather than trusting
 * this one-time render-time check to stay valid, so this only ever needs
 * to get the FIRST paint right.
 */
export default function Loading() {
  const [hasFreshFeed] = useState(() => isSpotFeedFresh());
  if (hasFreshFeed) {
    return <VideoFeedContent />;
  }
  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden bg-black">
        <VideoFeedSkeleton />
      </div>
    </AppShell>
  );
}
