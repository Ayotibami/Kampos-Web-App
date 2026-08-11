"use client";

import { useEffect, useRef, type RefObject } from "react";
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
// Raw finger movement (before any resistance) required before this even
// CLAIMS a touch as a pull attempt, regardless of boundary state. Matters
// most now that the touch surface spans the whole card frame, not just
// scrollable content: on a short/no-scroll gist, atTop()/atBottom() are
// true from the very first pixel, so without this, the tiniest incidental
// jitter during an ordinary tap on a header/footer button (the avatar, the
// "…" menu, a reaction) would claim the touch and preventDefault() it,
// silently eating the tap. A small slop distance — the same idea every
// native touch gesture system uses to tell "tap" from "drag" apart — fixes
// that without meaningfully delaying a genuine pull.
const CLAIM_SLOP_PX = 8;

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
 * Two different elements are involved on purpose, and they're not the same
 * thing:
 *  - `surfaceRef` (passed in) is WHERE the touch listeners actually attach
 *    — the whole card frame (header, body, footer, all of it), so the
 *    gesture works no matter where on the card someone's thumb happens to
 *    land, not just over the scrollable content itself.
 *  - `scrollRef` (returned) is WHAT gets measured for "is there room left
 *    to scroll" — the actual content element (a text paragraph, a caption
 *    panel, or nothing at all for bare media). Attach it to that specific
 *    element so its overflow/scrollTop is what the boundary check reads,
 *    even though the touch that triggers it might have started somewhere
 *    else on the card entirely.
 * Only one call site is ever `enabled` at a time per card (text vs. media
 * vs. expanded caption are mutually exclusive), so only one ever actually
 * attaches to the shared surface.
 *
 * Takes an externally-owned motion value rather than creating its own —
 * the visual response needs to move the WHOLE card, not just whatever
 * content happens to be inside it. So the caller (GistStack, which already
 * owns the whole-card wrapper) creates one shared `pullY` and hands it
 * down; every content piece that might be the thing someone's touching
 * drives the same shared value, and GistStack is the only one that
 * actually renders it as a transform.
 */
export function useOverscrollNav<T extends HTMLElement>({
  surfaceRef,
  y,
  onNext,
  onPrev,
  enabled = true,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  y: MotionValue<number>;
  onNext?: () => void;
  onPrev?: () => void;
  enabled?: boolean;
}) {
  const scrollRef = useRef<T>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return;

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

    // Measured on the CONTENT element (scrollRef), not the surface the
    // touch landed on — a touch starting on the header/footer chrome has
    // no scroll position of its own; it defers entirely to whatever the
    // actual content's boundary state is. No content element at all (or
    // one that's never been measured) reads as "no scroll room," same as
    // any other no-overflow case — trivially always at both edges.
    const atTop = () => {
      const el = scrollRef.current;
      return !el || el.scrollTop <= 0;
    };
    const atBottom = () => {
      const el = scrollRef.current;
      return !el || el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    };

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      pulling = false;
      committed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      if (!pulling) {
        // Claim the gesture only once it's moved a real amount (not just
        // tap jitter — see CLAIM_SLOP_PX) AND is trying to go past an edge
        // it's already resting at — anywhere mid-content, or below the
        // slop, this never fires, so a normal scroll (or a tap on a
        // header/footer button) is never interrupted.
        const dy = currentY - startY;
        if (Math.abs(dy) < CLAIM_SLOP_PX) return;
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

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", onTouchEnd);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [surfaceRef, enabled, onNext, onPrev, y]);

  return { scrollRef };
}
