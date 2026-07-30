/**
 * Loading placeholder shaped like a real GistCard (same rounding, shadow, and
 * header/body/footer zones) so the feed visually previews "a card is coming"
 * rather than showing one generic pulsing block.
 */
export function GistCardSkeleton() {
  return (
    <div className="h-full w-full overflow-hidden rounded-[32px] bg-surface-2 p-5 shadow-[0_24px_60px_-24px_rgba(9,30,66,0.55)] ring-1 ring-black/5 sm:p-6">
      <div className="flex h-full flex-col animate-pulse">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 rounded-full bg-line/60" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 rounded-full bg-line/60" />
            <div className="flex gap-1.5">
              <div className="h-3 w-14 rounded-full bg-line/40" />
              <div className="h-3 w-12 rounded-full bg-line/40" />
              <div className="h-3 w-10 rounded-full bg-line/40" />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mt-5 flex-1 space-y-3">
          <div className="h-3.5 w-full rounded-full bg-line/50" />
          <div className="h-3.5 w-[92%] rounded-full bg-line/50" />
          <div className="h-3.5 w-[78%] rounded-full bg-line/50" />
          <div className="h-3.5 w-[85%] rounded-full bg-line/50" />
          <div className="h-3.5 w-2/3 rounded-full bg-line/50" />
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end border-t border-line/40 pt-4">
          <div className="h-8 w-40 rounded-full bg-line/50" />
        </div>
      </div>
    </div>
  );
}
