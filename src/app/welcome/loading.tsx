/**
 * Skeleton for the welcome/landing screen (see page.tsx) — mirrors its
 * actual shape (full-bleed blue, marquee block + heading/copy/two buttons)
 * instead of a generic brand splash, matching every other route's own
 * loading.tsx.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh w-full animate-pulse flex-col overflow-hidden bg-brand md:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 pt-6 sm:pt-10 md:flex-[1.1] md:p-10">
        <div className="h-full w-full max-w-sm rounded-3xl bg-white/10 sm:max-w-md md:h-[80%] md:max-w-lg" />
      </div>
      <div className="flex shrink-0 flex-col px-6 pb-6 pt-4 sm:pb-8 md:flex-1 md:justify-center md:px-16 md:py-12">
        <div className="mx-auto h-7 w-56 rounded-full bg-white/20 md:mx-0 md:h-9 md:w-72" />
        <div className="mx-auto mt-3 h-4 w-4/5 rounded-full bg-white/15 sm:mt-4 md:mx-0 md:mt-8 md:w-2/3" />
        <div className="mt-4 space-y-2.5 sm:mt-6 sm:space-y-3 md:mt-10 md:max-w-xs">
          <div className="h-12 w-full rounded-full bg-white/15" />
          <div className="h-12 w-full rounded-full bg-white/20" />
        </div>
      </div>
    </div>
  );
}
