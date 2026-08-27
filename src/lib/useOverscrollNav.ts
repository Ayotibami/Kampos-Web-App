"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useMotionValue, animate, type MotionValue } from "framer-motion";

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

// How far off-screen a committed swipe finishes flying, in px — well past
// any real device height, so it's fully gone (not just past the edge of
// the visible viewport) by the time the next gist takes over. Exported —
// GistStack's own mount-entrance animation for the INCOMING card starts
// from this exact same distance on the opposite side, so the outgoing
// card's exit and the next card's entrance read as one continuous motion
// rather than two independently-tuned numbers that happen to be close.
export const EXIT_DISTANCE_PX = 700;
// Same reasoning — GistStack's entrance animation uses this exact value
// too, not its own copy.
export const COMMIT_EXIT_S = 0.18;
const SNAP_BACK_SPRING = { type: "spring", stiffness: 500, damping: 32 } as const;

/**
 * A vertical drag triggers a next/prev gist swap — and, unlike the old
 * version of this hook, the card now actually follows the finger live
 * while that drag is happening, instead of staying frozen until release.
 *
 * `dragY` is a Framer motion value OWNED BY THE CALLER (GistStack lifts
 * one and threads it down through GistCard into GistMediaBackdrop/
 * GistMediaBodyPanel — see those files), not created fresh here. That's
 * deliberate: this same gesture is wired up from three different places
 * depending on what's currently showing (plain text, media backdrop, or
 * an expanded media caption — only one is ever `enabled` at a time), and
 * all three need to move the SAME visual card, so they all have to share
 * one value rather than each quietly animating their own disconnected
 * copy. If a caller doesn't pass one, a local value is created as a
 * harmless fallback (nothing currently renders it, so it just no-ops).
 *
 * Still boundary-aware, same as before, and for the same reason: a touch
 * that starts on content which genuinely scrolls (a long paragraph, an
 * expanded caption) shouldn't hijack an ordinary reading-scroll. Only once
 * that content is already at its top/bottom edge does continuing to drag
 * count as a swipe. A touch that starts on the surrounding header/footer
 * chrome, or on content with nothing to scroll, counts right away — there's
 * no reading-scroll to protect there either way. NONE of that decision
 * logic changed from the previous version — only what happens once a
 * touch is claimed did.
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
  dragY: dragYProp,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  onNext?: () => void;
  onPrev?: () => void;
  enabled?: boolean;
  /** Shared live-position value — see this hook's own docstring. Falls
   * back to a local, unrendered value if the caller doesn't pass one. */
  dragY?: MotionValue<number>;
}) {
  const scrollRef = useRef<T>(null);
  const localDragY = useMotionValue(0);
  const dragY = dragYProp ?? localDragY;

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
    // True from the moment a commit's finish-animation starts until it
    // actually fires onNext/onPrev — this same card stays mounted (and
    // this same listener stays attached) for that whole short window, so
    // without this guard a second, immediate touch could grab the shared
    // dragY mid-flight and yank the still-exiting card back to a new raw
    // position. Simplest safe answer: ignore any touch that starts during
    // that window rather than try to gracefully interrupt it.
    let committing = false;

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
      if (committing) return;
      startY = e.touches[0].clientY;
      claimed = false;
      lastMoveY = startY;
      lastMoveTime = performance.now();
      const target = e.touches[0].target;
      startedInContent = !!scrollRef.current && target instanceof Node && scrollRef.current.contains(target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (committing) return;
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
      // Live 1:1 follow — the whole point of this rewrite. No spring, no
      // easing, just the raw finger delta, so the card feels physically
      // attached to the thumb rather than reacting to it a beat later.
      dragY.set(dy);
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
      if (committing || !claimed) return;
      claimed = false;
      const endY = e.changedTouches[0].clientY;
      const dy = endY - startY;
      const dt = performance.now() - lastMoveTime;
      const velocity = dt > 0 ? (endY - lastMoveY) / dt : 0;
      const fastFlick = Math.abs(velocity) > FAST_FLICK_PX_PER_MS;

      if (Math.abs(dy) < SWIPE_THRESHOLD_PX && !fastFlick) {
        // Didn't cross the threshold — spring back to resting position
        // instead of just staying wherever the finger let go.
        animate(dragY, 0, SNAP_BACK_SPRING);
        return;
      }

      // Positive means pulled down past the top (→ prev); negative means
      // pulled up past the bottom (→ next). A fast flick trusts its own
      // direction (the most instantaneous signal); otherwise the overall
      // drag direction decides. Same logic as before this rewrite —
      // committing just now ALSO finishes the visual motion first.
      const direction = fastFlick ? velocity : dy;
      committing = true;
      const exitTarget = direction > 0 ? EXIT_DISTANCE_PX : -EXIT_DISTANCE_PX;
      animate(dragY, exitTarget, { duration: COMMIT_EXIT_S, ease: "easeOut" }).then(() => {
        committing = false;
        if (direction > 0) onPrev?.();
        else onNext?.();
      });
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
    };
  }, [surfaceRef, enabled, onNext, onPrev, dragY]);

  return { scrollRef };
}
