/**
 * Loading placeholder shaped like the real Profile Settings form (avatar,
 * name fields, level chips, bio box, save button) so the page previews its
 * own layout while the profile fetch is in flight, instead of a spinner
 * that gives no sense of what's about to appear — same idea as
 * GistCardSkeleton for the feed.
 */
export function ProfileSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {/* Avatar + helper text */}
      <div className="flex flex-col items-center gap-3">
        <div className="h-3 w-56 max-w-full rounded-full bg-line/40" />
        <div className="h-24 w-24 rounded-full bg-line/50" />
      </div>

      {/* Name fields */}
      <div className="flex flex-col gap-3">
        <div className="h-3 w-40 rounded-full bg-line/40" />
        <div className="h-12 w-full rounded-2xl bg-line/40" />
        <div className="h-12 w-full rounded-2xl bg-line/40" />
      </div>

      {/* Level chips */}
      <div className="flex flex-col gap-2">
        <div className="h-3 w-28 rounded-full bg-line/40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-16 rounded-full bg-line/40" />
          ))}
        </div>
      </div>

      {/* Bio box */}
      <div className="flex flex-col gap-1">
        <div className="mb-1 h-3 w-32 rounded-full bg-line/40" />
        <div className="space-y-2 rounded-3xl border border-line p-4">
          <div className="h-3.5 w-full rounded-full bg-line/40" />
          <div className="h-3.5 w-[88%] rounded-full bg-line/40" />
          <div className="h-3.5 w-2/3 rounded-full bg-line/40" />
        </div>
        <div className="ml-auto mt-1 h-3 w-10 rounded-full bg-line/40" />
      </div>

      {/* Save button */}
      <div className="h-12 w-full rounded-full bg-line/50" />
    </div>
  );
}
