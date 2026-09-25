/**
 * Root-level Suspense fallback — NOT just "/"'s own loading state. Next
 * nests loading.js Suspense boundaries by segment, so for a client-side
 * navigation between two top-level routes that share no nested layout of
 * their own, the destination's own loading.tsx never actually mounts —
 * only this root one does (confirmed empirically, see feed/layout.tsx and
 * video/layout.tsx's own comments for the fix). /feed and /video both now
 * carry their own real layout.tsx specifically to opt out of that and get
 * their own loading.tsx reliably instead — this file no longer needs a
 * per-destination branch for either. This is the onboarding-carousel
 * skeleton (illustration block + heading/copy/dots/button, mirroring
 * OnboardingCarousel.tsx) for "/" and everything else that doesn't have
 * its own layout.tsx-based fallback.
 */
export default function Loading() {
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
