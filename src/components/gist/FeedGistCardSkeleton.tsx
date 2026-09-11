/**
 * Loading placeholder shaped like a real FeedGistCard — same card chrome as
 * ProfileGistCardSkeleton (rounded-[26px] border + shadow, list-friendly,
 * not GistCardSkeleton's full-bleed swipe-card shadow), but with a header
 * that actually matches FeedGistCard's own: an avatar circle, a name bar,
 * and a row of small tag pills (campus/major/level), not just a bare
 * timestamp. Without this, the loading state previews a much shorter
 * header than the real card ever has, and swapping skeleton → real content
 * visibly jumps in height the moment it loads.
 *
 * Body/footer variants mirror ProfileGistCardSkeleton's own (hero/text/
 * media) — FeedGistCard's body/footer are that same shape, just under a
 * richer header.
 */
export function FeedGistCardSkeleton({ variant = "text" }: { variant?: "hero" | "text" | "media" }) {
  return (
    <div className="rounded-[26px] border border-line bg-surface-2 shadow-sm">
      <div className="animate-pulse">
        {/* Header — avatar + name/avitag line + campus/major/level tag row,
            same shapes GistCardSkeleton already uses for this exact row. */}
        <div className="flex items-start gap-3 px-4 pt-3.5">
          <div className="h-11 w-11 shrink-0 rounded-full bg-line/60" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 rounded-full bg-line/60" />
            <div className="flex gap-1.5">
              <div className="h-3 w-14 rounded-full bg-line/40" />
              <div className="h-3 w-12 rounded-full bg-line/40" />
              <div className="h-3 w-10 rounded-full bg-line/40" />
            </div>
          </div>
          <div className="h-6 w-6 shrink-0 rounded-full bg-line/40" />
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
