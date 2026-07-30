"use client";

import { ReactionButton } from "./ReactionButton";
import type { Gist, ReactionType } from "@/types";

/**
 * Bottom engagement bar.
 * Since comments are now permanently visible on the right,
 * this just houses the reaction button, pushed to the right.
 */
export function FeedBottomBar({
  gist,
  onReact,
}: {
  gist: Gist | undefined;
  onReact: (type: ReactionType) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 px-4 pb-2.5 pt-1.5 sm:px-6 md:w-full md:px-8 md:pb-4">
      <ReactionButton onReact={onReact} />
    </div>
  );
}
