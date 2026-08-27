import { AppShell } from "@/components/layout/AppShell";
import { ProfileGistCardSkeleton } from "@/components/gist/ProfileGistCardSkeleton";
import { CommentPanelSkeleton } from "@/components/comment/CommentPanelSkeleton";
import { ArrowLeft } from "@/components/ui/icons";

// Mirrors ProfileView's real structure exactly (same fixed header, same
// avatar/name/tag-pill block, same three colored info boards, same bio
// shape, same gist-list/comment-panel split) so there's no visible reflow
// once the real profile streams in — just the same shapes filling in with
// real content. `avitag`/name/bio text can't be known here (loading.tsx
// gets no params), so those become plain bars; the three board tones
// (blue/gold/mint) and the bio's lavender ARE always the same regardless of
// whose profile this is, so those render in their real colors already.
const SKELETON_VARIANTS = ["media", "text", "hero", "text"] as const;

function BoardSkeleton({ tone }: { tone: "blue" | "gold" | "mint" }) {
  const bg = tone === "blue" ? "bg-[#dbe9fd]" : tone === "gold" ? "bg-[#fff0c2]" : "bg-[#dcf7e3]";
  return (
    <div className={`flex min-h-[74px] w-full min-w-0 flex-1 animate-pulse flex-col justify-center gap-2 rounded-2xl p-2.5 md:min-h-[140px] md:min-w-[200px] md:max-w-[240px] md:flex-none md:rounded-[32px] md:p-6 ${bg}`}>
      <div className="h-2 w-10 rounded-full bg-black/10 md:h-3 md:w-16" />
      <div className="h-2.5 w-16 rounded-full bg-black/15 md:h-4 md:w-24" />
    </div>
  );
}

export default function Loading() {
  return (
    <AppShell variant="panel">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pt-[60px]">
        <div className="relative z-10 flex w-full flex-1 flex-col">
          <div className="mx-auto flex w-full flex-1 flex-col md:max-w-6xl">
            {/* Fixed header — real back arrow, placeholder title bar (the
                real one is the avitag string, unknown here). */}
            <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-line/60 bg-surface-2/95 px-4 py-3 backdrop-blur-md sm:px-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted">
                <ArrowLeft className="h-5 w-5" />
              </div>
              <div className="h-4 w-28 animate-pulse rounded-full bg-line/50" />
            </div>

            {/* Avatar + name/tags + boards, same layout ProfileView uses. */}
            <div className="flex animate-pulse flex-col items-center gap-4 px-6 pb-6 pt-4 text-center md:flex-row md:items-start md:gap-10 md:px-12 md:pt-10 md:text-left">
              <div className="flex shrink-0 flex-col items-center gap-3 md:items-start">
                <div className="h-24 w-24 shrink-0 rounded-full bg-line/50 md:h-44 md:w-44" />
                <div className="flex flex-col items-center gap-1.5 md:items-start">
                  <div className="h-4 w-32 rounded-full bg-line/50 md:h-5 md:w-40" />
                  <div className="h-3 w-20 rounded-full bg-line/40" />
                  <div className="mt-0.5 flex gap-1.5">
                    <div className="h-4 w-14 rounded-full bg-line/40" />
                    <div className="h-4 w-12 rounded-full bg-line/40" />
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-1 flex-wrap items-center justify-center gap-2 md:flex-nowrap md:justify-start md:gap-8 md:pt-3">
                <BoardSkeleton tone="blue" />
                <BoardSkeleton tone="gold" />
                <BoardSkeleton tone="mint" />
              </div>
            </div>

            {/* Bio placeholder — same lavender tone/shape as the real one. */}
            <div className="mx-auto w-full max-w-[420px] animate-pulse px-6 md:max-w-[560px] md:px-12">
              <div className="flex min-h-[74px] w-full flex-col justify-center gap-2 rounded-2xl bg-[#ede9fe] p-2.5 md:rounded-[32px] md:p-6">
                <div className="h-2 w-10 rounded-full bg-black/10 md:h-3 md:w-14" />
                <div className="h-3 w-full rounded-full bg-black/10 md:h-4" />
                <div className="h-3 w-2/3 rounded-full bg-black/10 md:h-4" />
              </div>
            </div>

            {/* Gist list (left) + comment panel (right, desktop only) split —
                same breakpoint and widths as the real page. */}
            <div className="mt-8 md:mt-12 md:flex md:items-stretch">
              <div className="flex min-w-0 flex-1 justify-center px-4 pb-8 sm:px-6 md:px-12">
                <div className="w-full max-w-[740px]">
                  <ul className="flex flex-col gap-3">
                    {SKELETON_VARIANTS.map((variant, i) => (
                      <li key={i}>
                        <ProfileGistCardSkeleton variant={variant} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <CommentPanelSkeleton />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
