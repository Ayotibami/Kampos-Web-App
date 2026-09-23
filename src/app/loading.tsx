"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { VideoFeedSkeleton } from "./video/VideoFeedContent";

/**
 * Root-level Suspense fallback — NOT just "/"'s own loading state. Next
 * nests loading.js Suspense boundaries by segment, but for a client-side
 * navigation between two top-level routes that share no nested layout
 * (e.g. /feed -> /video, both sitting directly under this root layout),
 * the destination route's OWN loading.tsx (see video/loading.tsx) never
 * actually mounts — only this root one does, because it's the nearest
 * Suspense boundary already committed in the tree at the point the new
 * segment suspends (confirmed empirically: a marker placed in
 * video/loading.tsx never appeared during a throttled /feed -> /video
 * click-through, while one placed here did). video/loading.tsx still
 * covers the hard-reload/direct-URL case, where this whole file — and
 * its default branch below — is what's on screen for that one instant
 * before video/loading.tsx takes over.
 *
 * So this has to branch by destination instead of assuming it's always
 * the onboarding carousel's fallback. Default branch (below) is the
 * original onboarding-carousel skeleton (illustration block + heading/
 * copy/dots/button, mirroring OnboardingCarousel.tsx) for "/" and
 * everything else without a more specific case here.
 */
export default function Loading() {
  const pathname = usePathname();

  if (pathname.startsWith("/video")) {
    return (
      <AppShell variant="feed">
        <div className="flex h-dvh w-full overflow-hidden bg-black">
          <VideoFeedSkeleton />
        </div>
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-dvh w-full animate-pulse flex-col bg-surface md:h-dvh md:flex-row md:overflow-hidden">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-brand/[0.06] px-6 pt-10 md:flex-[1.1] md:p-0">
        <div className="aspect-[1024/922] w-full max-w-[420px] rounded-3xl bg-line/30 md:max-w-[70%] lg:h-[90%] lg:w-auto lg:max-w-[92%]" />
      </div>
      <div className="flex flex-col px-6 pb-10 pt-6 md:px-16 md:py-12">
        <div className="mb-16 hidden h-7 w-28 rounded-full bg-line/40 md:block" />
        <div className="flex flex-1 flex-col md:justify-center">
          <div className="space-y-4 md:space-y-5">
            <div className="mx-auto h-6 w-3/4 rounded-full bg-line/40 md:mx-0" />
            <div className="mx-auto h-4 w-2/3 rounded-full bg-line/30 md:mx-0" />
          </div>
          <div className="mt-auto space-y-6 pt-6 md:mt-14 md:max-w-xs md:pt-0">
            <div className="flex justify-center gap-2 md:justify-start">
              <div className="h-2 w-6 rounded-full bg-line/40" />
              <div className="h-2 w-2 rounded-full bg-line/25" />
              <div className="h-2 w-2 rounded-full bg-line/25" />
            </div>
            <div className="h-12 w-full rounded-full bg-line/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
