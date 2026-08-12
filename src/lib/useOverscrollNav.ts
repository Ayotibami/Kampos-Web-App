"use client";

import { useEffect, useRef, type RefObject } from "react";

// Raw finger travel, in px, a vertical drag has to cross before release
// counts as "swipe to next/prev". Deliberately small — a short, easy flick
// should register, not a big deliberate drag — but still bigger than any
// natural scroll-momentum bounce would ever produce on its own, so reading
// a long gist and letting go never accidentally navigates.
const SWIPE_THRESHOLD_PX = 32;
// A fast flick counts even if it didn't travel far — this is what makes a
// quick, short flick feel exactly as valid as a slower, longer drag. Speed
// is measured over the last touchmove only (see lastMoveY/lastMoveTime
// below), so it reflects how the finger was moving right at release, not
// an average over the whole gesture.
const FAST_FLICK_PX_PER_MS = 0.5;
// Raw finger movement required before this even CLAIMS a touch as a swipe
// attempt, regardless of boundary state. On a short/no-scroll gist,
// atTop()/atBottom() are true from the very first pixel, so without this,
// the tiniest incidental jitter during an ordinary tap on a header/footer
// button (the avatar, the "…" menu, a reaction) would claim the touch and
// preventDefault() it, silently eating the tap.
const CLAIM_SLOP_PX = 8;

/**
 * A vertical drag triggers a next/prev gist swap. Deliberately the
 * simplest version of this gesture that still behaves correctly: no
 * live-tracking motion value, no spring, nothing to keep in sync
 * frame-by-frame — the card doesn't move at all while the finger is still
 * down. Just watch where a touch started and where it ended, and if it
 * crossed the distance threshold OR was moving fast at release, call
 * onNext/onPrev once. The resulting animation (see GistStack) is a fixed,
 * independent transition that plays on its own once triggered — it has no
 * need to know anything about the drag that triggered it.
 *
 * Still boundary-aware, same as before, and for the same reason: a touch
 * that starts on content which genuinely scrolls (a long paragraph, an
 * expanded caption) shouldn't hijack an ordinary reading-scroll. Only once
 * that content is already at its top/bottom edge does continuing to drag
 * count as a swipe. A touch that starts on the surrounding header/footer
 * chrome, or on content with nothing to scroll, counts right away — there's
 * no reading-scroll to protect there either way.
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
 */
export function useOverscrollNav<T extends HTMLElement>({
  surfaceRef,
  onNext,
  onPrev,
  enabled = true,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  onNext?: () => void;
  onPrev?: () => void;
  enabled?: boolean;
}) {
  const scrollRef = useRef<T>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return;

    let startY = 0;
    // Only true once a drag has actually been claimed as a swipe attempt
    // (see onTouchMove) — before that, every event is left alone so native
    // scroll behaves completely normally.
    let claimed = false;
    // The most recent touchmove's position/time — used only to measure how
    // fast the finger was moving in the instant right before release (see
    // FAST_FLICK_PX_PER_MS), not an average over the whole gesture.
    let lastMoveY = 0;
    let lastMoveTime = 0;
    // Whether THIS touch started inside the actual scrollable content (the
    // text paragraph, the caption panel) as opposed to the surrounding
    // header/footer chrome (avatar row, date/reactions row). The
    // header/footer were never readable in the first place — there's no
    // "still scrolling to read" state to protect there, so a pull starting
    // on them should navigate immediately regardless of where the content
    // happens to be scrolled to. Only a touch that starts ON the content
    // itself needs the boundary gate below.
    let startedInContent = true;

    const atTop = () => {
      if (!startedInContent) return true;
      const el = scrollRef.current;
      return !el || el.scrollTop <= 0;
    };
    const atBottom = () => {
      if (!startedInContent) return true;
      const el = scrollRef.current;
      return !el || el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    };

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      claimed = false;
      lastMoveY = startY;
      lastMoveTime = performance.now();
      const target = e.touches[0].target;
      startedInContent = !!scrollRef.current && target instanceof Node && scrollRef.current.contains(target);
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (!claimed) {
        // Claim the gesture only once it's moved a real amount (not just
        // tap jitter — see CLAIM_SLOP_PX) AND is trying to go past an edge
        // it's already resting at — anywhere mid-content, or below the
        // slop, this never fires, so a normal scroll (or a tap on a
        // header/footer button) is never interrupted.
        if (Math.abs(dy) < CLAIM_SLOP_PX) return;
        if (dy > 0 && atTop()) claimed = true;
        else if (dy < 0 && atBottom()) claimed = true;
        else return;
      }
      // Once claimed, this touch is ours for the rest of the gesture —
      // stop the browser from also trying to scroll/bounce the same drag.
      e.preventDefault();
      const now = performance.now();
      const dt = now - lastMoveTime;
      // Recorded for the NEXT call to read (see onTouchEnd) — this frame's
      // own speed needs last frame's position, so update after using it.
      if (dt > 0) {
        lastMoveY = currentY;
        lastMoveTime = now;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!claimed) return;
      claimed = false;
      const endY = e.changedTouches[0].clientY;
      const dy = endY - startY;
      const dt = performance.now() - lastMoveTime;
      const velocity = dt > 0 ? (endY - lastMoveY) / dt : 0;
      const fastFlick = Math.abs(velocity) > FAST_FLICK_PX_PER_MS;
      if (Math.abs(dy) < SWIPE_THRESHOLD_PX && !fastFlick) return;
      // Positive means pulled down past the top; negative means pulled up
      // past the bottom. A fast flick trusts its own direction (the most
      // instantaneous signal); otherwise the overall drag direction decides.
      const direction = fastFlick ? velocity : dy;
      if (direction > 0) onPrev?.();
      else onNext?.();
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
    };
  }, [surfaceRef, enabled, onNext, onPrev]);

  return { scrollRef };
}
