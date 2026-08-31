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
export const COMMIT_EXIT_S = 0.5;
const SNAP_BACK_SPRING = { type: "spring", stiffness: 500, damping: 32 } as const;

/**
 * A vertical drag triggers a next/prev gist swap — the card follows the
 * finger live while the drag is happening, instead of staying frozen until
 * release.
 *
 * `dragY` is a Framer motion value OWNED BY THE CALLER (GistStack lifts one
 * and threads it down through GistCard into GistMediaBackdrop/
 * GistMediaBodyPanel — see those files), not created fresh here. That's
 * deliberate: this same gesture is wired up from three different places
 * depending on what's currently showing (plain text, media backdrop, or an
 * expanded media caption — only one is ever `enabled` at a time), and all
 * three need to move the SAME visual card, so they all have to share one
 * value rather than each quietly animating their own disconnected copy. If
 * a caller doesn't pass one, a local value is created as a harmless
 * fallback (nothing currently renders it, so it just no-ops).
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
  dragY: dragYProp,
  opacity,
  canGoNext = true,
  canGoPrev = true,
  committingRef,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  /** Called with the raw dragY value this card's exit is committing from
   * (see onTouchEnd below) — GistStack uses it to start the INCOMING
   * card's entrance from a position that mirrors this exact release point,
   * instead of always a fixed distance, so the two cards move in lockstep
   * regardless of how far the swipe was dragged before release. Callers
   * that don't care (comment-panel expanded-caption nav, etc.) can just
   * ignore the argument — it's only ever meaningful to GistStack. */
  onNext?: (fromDragY?: number) => void;
  onPrev?: (fromDragY?: number) => void;
  enabled?: boolean;
  /** Shared live-position value — see this hook's own docstring. Falls
   * back to a local, unrendered value if the caller doesn't pass one. */
  dragY?: MotionValue<number>;
  /** Shared opacity value — deliberately NEVER touched during a live drag
   * (only dragY is), so a card being dragged — whether it ends up
   * committing or springing back — stays fully visible the entire time,
   * same as nothing here ever fading before it had anything to move.
   * Only animated at the exact moment a swipe commits below, alongside
   * (same duration, same start) dragY's own exit tween. Deriving opacity
   * FROM dragY's raw position instead is tempting (fewer moving parts),
   * but breaks sync with the incoming card's entrance: a released card's
   * exit continues from wherever the LIVE drag already carried it —
   * anywhere from just past the swipe threshold to much further — while a
   * freshly mounted incoming card always starts its own entrance from the
   * full distance. A big released drag would start its exit already
   * significantly faded, reaching invisible well before the incoming card
   * (always starting from zero) caught up to fully visible. A dedicated
   * value that only ever runs 1→0 (or 0→1, for an entrance — see
   * GistStack's own layout effect) over the fixed commit duration,
   * regardless of where the drag itself left things, keeps the two
   * perfectly in sync no matter how far someone dragged before releasing.
   * Optional: a caller with nothing visual riding on this (comment-panel
   * nav, etc.) simply never passes one. */
  opacity?: MotionValue<number>;
  /** Whether committing a swipe in that direction actually has somewhere
   * to go RIGHT NOW. Defaults to true (unchanged behavior for any caller
   * that doesn't pass these — comment-panel expanded-caption nav, etc.,
   * where this end-of-list nuance doesn't apply). GistStack is the one
   * caller that does pass real values: false for "next" past the last
   * loaded gist while more might still be coming, so a commit here would
   * otherwise fling the card off into nothing (see GistStack's own
   * canGoNext for the full reasoning). When false, a crossed-threshold
   * drag in that direction springs back exactly like an under-threshold
   * one instead of committing — the gesture itself is never blocked
   * (still fully live, still draggable), it just doesn't fly off to
   * somewhere that doesn't exist yet. */
  canGoNext?: boolean;
  canGoPrev?: boolean;
  /** Flipped to true at the exact moment a swipe commits — before onNext/
   * onPrev fire, in the same synchronous tick (see onTouchEnd below).
   * Shared with the caller for one reason: GistStack keeps the outgoing
   * card mounted a little longer via AnimatePresence to let its exit
   * finish (see GistStackCard's own usePresence effect), and that effect
   * needs to know FOR CERTAIN whether this card's exit is already under
   * way (started here, continuing from wherever the live drag left it) or
   * never started at all (index changed some other way — keyboard, wheel
   * — dragY never moved). Guessing that from dragY's current value would
   * work most of the time but isn't reliable — a wrong guess would
   * restart the animation partway through and produce a visible hitch. */
  committingRef?: RefObject<boolean>;
}) {
  const scrollRef = useRef<T>(null);
  const localDragY = useMotionValue(0);
  const dragY = dragYProp ?? localDragY;
  // Refs, not read directly in the effect below — canGoNext/canGoPrev can
  // change on every single swipe (GistStack recomputes them from `index`),
  // and the touch-handling effect deliberately does NOT re-run on every
  // swipe (see its own dependency array) — re-attaching touch listeners
  // that often would be wasteful and risks dropping an in-progress touch.
  // A ref lets onTouchEnd always read the CURRENT value without the effect
  // itself needing to know these changed.
  const canGoNextRef = useRef(canGoNext);
  const canGoPrevRef = useRef(canGoPrev);
  useEffect(() => {
    canGoNextRef.current = canGoNext;
    canGoPrevRef.current = canGoPrev;
  }, [canGoNext, canGoPrev]);

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
    // True from the moment a commit is decided onward — never reset back
    // to false. onNext/onPrev fire immediately (see onTouchEnd below), but
    // this same card/listener stays mounted a little longer to finish its
    // own exit (GistStack keeps it around via AnimatePresence/usePresence
    // for exactly that window), so without this guard a second, immediate
    // touch could still grab the shared dragY mid-flight and yank the
    // already-departing card back to a new raw position. Simplest safe
    // answer: ignore any touch that starts once this card is on its way
    // out rather than try to gracefully interrupt it.
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
      // Live 1:1 follow — the whole point of this hook. No spring, no
      // easing, just the raw finger delta, so the card feels physically
      // attached to the thumb rather than reacting to it a beat later.
      // Deliberately the ONLY thing touched here — opacity stays exactly
      // where it already is (see this hook's own docs on `opacity`), so
      // the card never fades while it's simply being explored.
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
      // drag direction decides.
      const direction = fastFlick ? velocity : dy;

      // Crossed the threshold, but there's genuinely nowhere for THIS
      // direction to go yet (see canGoNext/canGoPrev's own docs) — treat
      // it exactly like an under-threshold drag instead of flinging the
      // card off toward nothing. The gesture itself was never blocked —
      // it followed the finger the whole way, live — it just doesn't
      // commit to a destination that doesn't exist.
      const allowed = direction > 0 ? canGoPrevRef.current : canGoNextRef.current;
      if (!allowed) {
        animate(dragY, 0, SNAP_BACK_SPRING);
        return;
      }

      // committing never gets reset back to false here — this touch
      // surface's card is on its way out (GistStack is about to swap in
      // the next one, see below) and stays mounted only long enough to
      // finish this exit (see GistStack's own AnimatePresence/usePresence
      // handling), never interactive again after this point.
      committing = true;
      // Set before onNext/onPrev fire, in this same synchronous tick — by
      // the time GistStack's re-render is processed and GistStackCard's
      // own effect checks this, it's already reliably true. See this
      // param's own docs on why a boolean flag here beats inferring it.
      if (committingRef) committingRef.current = true;
      const exitTarget = direction > 0 ? EXIT_DISTANCE_PX : -EXIT_DISTANCE_PX;
      // Captured before animate() below starts moving it — this is the
      // exact raw position the finger released at, handed to onNext/onPrev
      // so the INCOMING card's entrance can start from a position that
      // mirrors it (see this hook's own onNext/onPrev docs).
      const releaseY = dragY.get();
      // Kicked off but deliberately not awaited — this card's own exit
      // keeps playing out on `dragY` regardless of what happens next.
      // onNext/onPrev fire IMMEDIATELY below, not once this resolves: the
      // whole point is that GistStack swaps in the next gist right away,
      // so the incoming card mounts and starts its own entrance at the
      // same instant this one starts leaving — both animating in
      // parallel, like a conveyor belt, rather than one finishing before
      // the other even begins.
      animate(dragY, exitTarget, { duration: COMMIT_EXIT_S, ease: "easeOut" });
      // opacity deliberately left untouched here — a committed card now
      // flies out at full opacity the whole way, no fade. `opacity` is
      // still accepted as a param (GistStack still owns and passes one) so
      // nothing downstream has to change shape, it's just never animated.
      if (direction > 0) onPrev?.(releaseY);
      else onNext?.(releaseY);
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
    };
  }, [surfaceRef, enabled, onNext, onPrev, dragY, opacity, committingRef]);

  return { scrollRef };
}
