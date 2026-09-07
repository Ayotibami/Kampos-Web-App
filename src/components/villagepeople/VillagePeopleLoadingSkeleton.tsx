/**
 * Fallback for VillagePeopleLayout's own auth check — same reasoning as
 * SettingsLoadingSkeleton: a segment's loading.tsx does NOT cover its own
 * layout.tsx, only page.tsx and below, so without a local <Suspense>
 * fallback here this would fall through to the ROOT's loading.tsx (the
 * onboarding-carousel skeleton) instead of anything shaped like this admin
 * shell. Nav item count/labels are static, not fetched, so this is safe to
 * hardcode rather than guess at.
 */
export function VillagePeopleLoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 md:flex-row">
      <nav className="hidden w-64 shrink-0 flex-col border-r border-line/70 p-6 md:flex">
        <div className="mb-6 flex animate-pulse items-center gap-2.5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-line/40" />
          <div className="h-5 w-32 rounded-full bg-line/50" />
        </div>
        <div className="flex flex-1 flex-col gap-2 animate-pulse">
          <div className="h-9 w-full rounded-2xl bg-line/30" />
          <div className="h-9 w-full rounded-2xl bg-line/20" />
        </div>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <div className="h-6 w-48 animate-pulse rounded-full bg-line/40" />
      </div>
    </div>
  );
}
