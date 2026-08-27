/**
 * Generic loading placeholder for the Settings pages that are just a list of
 * rows/cards (Hub, Account, Legal, Support) rather than a form —
 * ProfileSettingsSkeleton already covers the one settings page shaped like a
 * form (Profile). `count` lets the rail-position placeholder (fewer, wider
 * rows) and the card-grid pages (more, squarer rows) share this instead of
 * each hand-rolling their own row count.
 */
export function SettingsRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-line/60 p-4">
          <div className="h-9 w-9 shrink-0 rounded-full bg-line/50" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded-full bg-line/50" />
            <div className="h-2.5 w-2/3 rounded-full bg-line/30" />
          </div>
        </div>
      ))}
    </div>
  );
}
