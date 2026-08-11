"use client";

import { useEffect, useRef } from "react";
import { animate, type MotionValue } from "framer-motion";

// How much the content visually "gives" while pulled past its own edge —
// damped well below 1:1 with the finger so it reads as resistance (the
// classic iOS overscroll bounce), not a full free drag.
const PULL_RESISTANCE = 0.45;
// How far (already-damped) that pull has to travel before release actually
// commits to navigating, rather than just snapping back — big enough that
// the natural little bounce at the end of a normal scroll never fires it by
// accident.
const COMMIT_THRESHOLD_PX = 70;

/**
 * Turns "keep dragging vertically after you've hit the edge of this
 * content" into a next/prev navigation gesture, without ever competing with
 * ordinary reading-scroll for the same touch: while there's still something
 * left to scroll, this does nothing at all and the browser's native scroll
 * owns the gesture completely. Only once the user is already resting at the
 * very top or bottom AND keeps dragging past it does this take over —
 * rubber-banding a little so it reads as "one more pull and this'll move
 * on," then firing onPrev (pulled down past the top) or onNext (pulled up
 * past the bottom) once they commit past the threshold, and spring-snapping
 * back to rest either way on release.
 *
 * Works identically for content with nothing to scroll at all (a short
 * hero-text card, a bare media tile) — with no overflow, `scrollTop` is
 * always 0 and already at both "top" and "bottom" simultaneously, so any
 * vertical drag on it is immediately treated as a pull past the edge. No
 * special-casing needed for the no-scroll case; it falls out for free.
 *
 * Takes an externally-owned motion value rather than creating its own —
 * detection (does THIS specific piece of content still have room to
 * scroll?) has to happen deep inside whatever's actually being touched
 * (the text paragraph, the media tile, the caption panel — a different
 * element per gist type), but the visual response needs to move the WHOLE
 * card (header, footer, shadow, everything), not just that one inner
 * piece. So the caller (GistStack, which already owns the whole-card
 * wrapper) creates one shared `pullY` and hands it down; every content
 * piece that might be the thing someone's touching drives the same shared
 * value, and GistStack is the only one that actually renders it as a
 * transform.
 *
 * Returns a ref for the actual scrollable element (or any plain element,
 * for the no-scroll case) — attach it to whatever's being watched for its
 * own scroll boundary.
 */
export function useOverscrollNav<T extends HTMLElement>({
  y,
  onNext,
  onPrev,
  enabled = true,
}: {
  y: MotionValue<number>;
  onNext?: () => void;
  onPrev?: () => void;
  enabled?: boolean;
}) {
  const scrollRef = useRef<T>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    let startY = 0;
    // Where the finger was at the MOMENT the gesture got claimed as an
    // edge-pull (set fresh in onTouchMove, below) — deliberately not the
    // same as startY. If someone does one continuous scroll from mid-gist
    // down to the very bottom, that's a lot of finger travel that has
    // nothing to do with "pulling past the edge"; baselining the pull
    // distance from startY would carry all of that pre-boundary travel
    // straight into the pull, potentially blowing past the commit
    // threshold on the very first frame after the boundary's reached —
    // exactly the accidental-trigger problem this gesture exists to avoid.
    // Re-zeroing here means the pull always visibly builds from 0 at the
    // instant it's actually claimed, however the finger got there.
    let pullStartY = 0;
    // Only true once a drag has actually been claimed as an edge-pull (see
    // onTouchMove) — before that, every event is left alone so native
    // scroll behaves completely normally.
    let pulling = false;
    let committed = false;

    const atTop = () => el.scrollTop <= 0;
    const atBottom = () => el.scrollTop >= el.scrollHeight - el.clientHeight - 1;

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      pulling = false;
      committed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      if (!pulling) {
        // Claim the gesture only at the exact moment it's trying to go
        // past an edge it's already resting at — anywhere mid-content this
        // never fires, so a normal scroll is never interrupted.
        const dy = currentY - startY;
        if (dy > 0 && atTop()) {
          pulling = true;
          pullStartY = currentY;
        } else if (dy < 0 && atBottom()) {
          pulling = true;
          pullStartY = currentY;
        } else {
          return;
        }
      }
      // Once claimed, this touch is ours for the rest of the gesture —
      // stop the browser from also trying to scroll/bounce the same drag.
      e.preventDefault();
      const pullDy = currentY - pullStartY;
      const resisted = pullDy * PULL_RESISTANCE;
      y.set(resisted);
      committed = Math.abs(resisted) > COMMIT_THRESHOLD_PX;
    };

    const onTouchEnd = () => {
      if (pulling && committed) {
        if (y.get() > 0) onPrev?.();
        else onNext?.();
      }
      pulling = false;
      committed = false;
      animate(y, 0, { type: "spring", stiffness: 400, damping: 32 });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onNext, onPrev, y]);

  return { scrollRef };
}
