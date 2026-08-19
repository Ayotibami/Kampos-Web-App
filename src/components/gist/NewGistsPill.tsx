"use client";

/**
 * Floating pill that appears at the top of the gist feed when a background
 * refresh has silently fetched new gists. Tapping it swaps the stale cached
 * list for the fresh one — no loading, instant.
 *
 * Styled as a small curved pill in brand blue (#165abf) with white text,
 * centered horizontally above the gist list.
 */

import { useGistStore } from "@/stores/gistStore";

export function NewGistsPill({ onLoad }: { onLoad?: () => void }) {
  const hasNewGists = useGistStore((s) => s.hasNewGists);
  const storeLoad = useGistStore((s) => s.loadNewGists);

  if (!hasNewGists) return null;

  return (
    <div className="sticky top-[68px] z-20 flex justify-center">
      <button
        type="button"
        onClick={() => (onLoad ? onLoad() : storeLoad())}
        className="rounded-full bg-[#165abf] px-5 py-2 font-nunito text-sm font-semibold text-white shadow-lg transition active:scale-95"
      >
        Check out new gists
      </button>
    </div>
  );
}
