/**
 * Loading placeholder shaped like ProfileGistCard — same rounding, border,
 * and shadow (see ProfileGistCard's own note on why the border/shadow are
 * there: card and page background are nearly identical in light mode) so
 * the list visually previews "cards are coming" instead of a plain
 * "Loading…" line. Three variants so a run of skeletons doesn't read as
 * identical blocks — mirrors the real mix of short/long/media gists a
 * profile list actually shows.
 */
export function ProfileGistCardSkeleton({ variant = "text" }: { variant?: "hero" | "text" | "media" }) {
  return (
    <div className="rounded-[26px] border border-line bg-surface-2 shadow-sm">
      <div className="animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5">
          <div className="h-3 w-14 rounded-full bg-line/50" />
          <div className="h-6 w-6 rounded-full bg-line/40" />
        </div>

        {/* Body */}
        <div className="px-4 pt-2.5">
          {variant === "hero" ? (
            <div className="min-h-[160px] w-full rounded-2xl bg-line/40" />
          ) : (
            <div className="space-y-2.5">
              <div className="h-3.5 w-full rounded-full bg-line/50" />
              <div className="h-3.5 w-[88%] rounded-full bg-line/50" />
              <div className="h-3.5 w-[70%] rounded-full bg-line/50" />
            </div>
          )}
          {variant === "media" && <div className="mt-2.5 h-52 w-full rounded-2xl bg-line/40" />}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line/40 px-4 pb-3.5 pt-2.5">
          <div className="h-3 w-28 rounded-full bg-line/40" />
          <div className="h-6 w-24 rounded-full bg-line/40" />
        </div>
      </div>
    </div>
  );
}
