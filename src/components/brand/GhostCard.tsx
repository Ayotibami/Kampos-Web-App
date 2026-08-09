import { gistColorFor } from "@/lib/brand";

/**
 * A purely decorative card *silhouette* — an avatar dot, a name-line bar,
 * and a colored content block, no real readable text — used for the
 * orbiting cards around Kappy on the onboarding carousel. The original
 * treatment rendered the actual `MiniGistCard`/`MiniCommentCard` (real
 * names, real gist text) at orbit scale, which read as genuinely squeezed
 * even on desktop and, once mobile shrank the whole orbit further, ended
 * up smothering Kappy's face entirely instead of framing him. A shape you
 * only ever glance at doesn't need to be legible — it needs to *read* as
 * "a gist card" at a glance, which a few abstract bars does just as well
 * as real (illegibly tiny) text, at a fraction of the visual weight.
 */
export function GhostCard({
  tail = false,
  colorSeed,
  className = "",
}: {
  /** Chat-bubble tail on the top-left — the comment-card treatment. */
  tail?: boolean;
  colorSeed: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full ${className}`}>
      {tail && (
        <svg
          className="absolute -left-2 top-0 h-3 w-2.5 text-surface-2"
          viewBox="0 0 12 16"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 0H0L12 16V0Z" />
        </svg>
      )}
      <div
        className={`overflow-hidden rounded-xl bg-surface-2 p-2 shadow-lg ring-1 ring-black/5 ${tail ? "rounded-tl-sm" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 shrink-0 rounded-full bg-brand/25" />
          <div className="h-1.5 flex-1 rounded-full bg-ink/15" />
        </div>
        <div className="mt-1.5 h-5 rounded-lg" style={{ backgroundColor: gistColorFor(colorSeed) }} />
      </div>
    </div>
  );
}
