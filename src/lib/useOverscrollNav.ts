"use client";

import { useEffect, useRef, type RefObject } from "react";
import { animate, type MotionValue } from "framer-motion";

// How much the content visually "gives" while pulled past its own edge —
// still damped enough to read as resistance (the classic iOS overscroll
// bounce) rather than a bare 1:1 drag, but only lightly — heavier damping
// here is what made the whole gesture feel stiff/rigid even after the
// commit threshold itself came down, since the card visibly lags behind
// the finger for the ENTIRE drag, not just at the very end.
const PULL_RESISTANCE = 0.7;
// How far (already-damped) that pull has to travel before release actually
// commits to navigating, rather than just snapping back — big enough that
// the natural little bounce at the end of a normal scroll never fires it by
// accident. Deliberately small: this is the SLOW-drag path, not the only
// path — see VELOCITY_COMMIT_PX_PER_MS below for a quick flick that
// commits well before traveling this far at all.
const COMMIT_THRESHOLD_PX = 42;
// A fast flick commits even short of the distance threshold — same idea as
// the horizontal swipe's own velocity check (SWIPE_THRESHOLD in GistStack,
// paired with a ~500px/s velocity trigger). 0.5px/ms = 500px/s, matching
// that existing feel so both gestures need roughly the same effort.
const VELOCITY_COMMIT_PX_PER_MS = 0.5;
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
 * A vertical drag turns into a next/prev navigation gesture, without ever
 * competing with ordinary reading-scroll for the same touch:
 *  - Started on the header/footer chrome, or on content with nothing to
 *    scroll (a short hero card, bare media) — navigates right away. There's
 *    no reading-scroll to protect in either case, so the whole thing
 *    behaves like a big tap-adjacent swipe target.
 *  - Started on content that genuinely overflows (a long paragraph, an
 *    expanded caption) — reads its real scroll position. While there's
 *    still something left to scroll, this does nothing at all and native
 *    scroll owns the touch completely. Reaching the actual top/bottom and
 *    continuing to pull DOES still navigate, deliberately — reaching the
 *    end of something you're reading and continuing is the expected "next"
 *    gesture in reading-heavy apps (Kindle, Twitter threads), not an
 *    accident to guard against. What prevents an ordinary vigorous
 *    scroll-to-the-bottom (and its natural little native bounce) from
 *    misfiring isn't disabling this — it's COMMIT_THRESHOLD_PX and
 *    VELOCITY_COMMIT_PX_PER_MS below requiring a genuinely deliberate extra
 *    pull, well beyond what a normal scroll's own momentum ever produces.
 *
 * When it does navigate: a little rubber-band as the drag builds, so it
 * reads as "one more pull and this'll move on," then firing onPrev (pulled
 * down) or onNext (pulled up) once the release qualifies as a commit —
 * either the pull traveled far enough (COMMIT_THRESHOLD_PX, for a slower
 * deliberate drag) or it was moving fast enough
 * (VELOCITY_COMMIT_PX_PER_MS, for a quick short flick that never had to
 * travel far) — and spring-snapping back to rest either way on release.
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
    // Instantaneous speed of the last touchmove, in raw (pre-resistance)
    // px/ms, signed the same way as `dy` (negative = moving up). Tracked
    // only from the moment of claiming onward — a fast, short flick should
    // commit on release even if it never traveled far enough to cross
    // COMMIT_THRESHOLD_PX on distance alone.
    let velocity = 0;
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

    // Measured on the CONTENT element (scrollRef) — but only actually
    // consulted when the touch itself started there (see startedInContent
    // above). A touch starting on the header/footer chrome always reads as
    // "at the edge" (nothing there to protect). A touch starting on the
    // content itself reads its REAL scroll position — reaching the actual
    // end and continuing to pull deliberately still advances (the
    // Kindle/Twitter-thread expectation: "keep going" at the end of
    // something you're reading IS the next action), same as it's always
    // been. What keeps a normal vigorous scroll-to-the-bottom from
    // accidentally firing this isn't disabling it here — it's
    // COMMIT_THRESHOLD_PX/VELOCITY_COMMIT_PX_PER_MS below requiring a
    // genuinely deliberate extra pull past the edge, well beyond what
    // native scroll's own little bounce ever produces on its own. No
    // content element at all (or one that's never been measured) reads as
    // "no scroll room," same as any other no-overflow case.
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
      pulling = false;
      committed = false;
      const target = e.touches[0].target;
      startedInContent = !!scrollRef.current && target instanceof Node && scrollRef.current.contains(target);
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
        lastMoveY = currentY;
        lastMoveTime = performance.now();
      }
      // Once claimed, this touch is ours for the rest of the gesture —
      // stop the browser from also trying to scroll/bounce the same drag.
      e.preventDefault();
      const now = performance.now();
      const dt = now - lastMoveTime;
      if (dt > 0) velocity = (currentY - lastMoveY) / dt;
      lastMoveY = currentY;
      lastMoveTime = now;
      const pullDy = currentY - pullStartY;
      const resisted = pullDy * PULL_RESISTANCE;
      y.set(resisted);
      committed = Math.abs(resisted) > COMMIT_THRESHOLD_PX;
    };

    const onTouchEnd = () => {
      const fastFlick = Math.abs(velocity) > VELOCITY_COMMIT_PX_PER_MS;
      if (pulling && (committed || fastFlick)) {
        // A fast flick trusts velocity's sign (the most instantaneous,
        // accurate signal for a quick gesture); a slower pull that
        // committed on distance alone trusts the pulled position's sign
        // instead — either way, positive means "pulled down past the top."
        const direction = fastFlick ? velocity : y.get();
        if (direction > 0) onPrev?.();
        else onNext?.();
      }
      pulling = false;
      committed = false;
      velocity = 0;
      // Matches the stack's own mobile fly-off spring (GistStack's
      // mobileSlotFor transition) exactly, not just "something snappy" —
      // when this fires, the outer card is ALSO mid-transition into its
      // new slot on that same spring; a stiffer, faster spring here used
      // to finish resetting this inner offset well before the outer one
      // settled, so the last bit of the transition visibly changed speed
      // partway through instead of reading as one continuous motion.
      animate(y, 0, { type: "spring", stiffness: 230, damping: 27, mass: 0.9 });
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
