"use client";

import { SendIconFill } from "@/components/ui/icons";
import { CommentSkeletonItem } from "./CommentList";

/**
 * Route-level loading.tsx equivalent of CommentPanel (desktop side pane) —
 * same wrapper/doodle/header/composer markup, real CommentSkeletonItem list
 * (the exact placeholder CommentList itself shows while loading, exported
 * from there so the two can never drift apart), and a genuinely disabled
 * textarea+button rather than an interactive one, matching CommentComposer's
 * own real disabled-no-gist-yet appearance instead of approximating it.
 */
export function CommentPanelSkeleton() {
  return (
    <div className="relative hidden h-full w-[360px] shrink-0 border-l border-line bg-brand/[0.04] dark:border-white/10 dark:bg-brand-ink md:block">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-90 dark:opacity-80 dark:invert"
        style={{
          backgroundImage: "url('/brand/doodles.svg')",
          backgroundRepeat: "repeat",
          backgroundSize: "220px auto",
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden">
        <div className="relative flex items-center justify-center border-b border-line bg-brand/[0.04] px-5 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
          <div className="h-3.5 w-24 animate-pulse rounded-full bg-line/50" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5">
          <ul className="space-y-4 py-4 pr-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <CommentSkeletonItem key={i} short={i % 2 === 1} />
            ))}
          </ul>
        </div>

        <div className="flex items-end gap-2 border-t border-line bg-brand/[0.04] p-4 backdrop-blur-sm dark:border-white/10 dark:bg-brand-ink/85">
          <div className="relative flex-1">
            <div className="h-11 w-full rounded-3xl bg-[#A9C9F85C] px-4 py-3 opacity-50 dark:bg-white/10" />
          </div>
          <button
            type="button"
            disabled
            aria-hidden
            className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white opacity-40 shadow-sm shadow-brand/30"
          >
            <SendIconFill className="h-5 w-5" weight="duotone" />
          </button>
        </div>
      </div>
    </div>
  );
}
