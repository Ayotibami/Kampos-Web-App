"use client";

/**
 * Pull-to-refresh — tracks a downward touch drag and, past a threshold,
 * calls `onRefresh`. Returns pull distance + state for the indicator, and
 * a ref to attach to the container the gesture should listen on.
 *
 * Two things make this work reliably on a real iPhone, not just in a
 * quick test:
 *
 * 1. Real `addEventListener` calls (via a ref + effect), NOT React's own
 *    onTouchStart/onTouchMove JSX props. React registers its touchmove
 *    listener as passive by default (the browser's own recommended
 *    default, for scroll performance), which silently means
 *    `preventDefault()` inside a React onTouchMove handler does nothing
 *    at all. Without a real preventDefault, iOS Safari is free to treat a
 *    downward drag at the top of the list as ITS OWN gesture (a
 *    rubber-band bounce, or its own native "pull down to reload the
 *    page") at the same time this hook is trying to track it as a custom
 *    pull-to-refresh. Attaching the listener ourselves with
 *    `{ passive: false }` is what actually lets `preventDefault()` take
 *    effect — called only once we're sure this really is a downward pull
 *    (delta > 0), so ordinary scrolling elsewhere is unaffected.
 *
 * 2. "Am I at the top" is read FRESH, directly off the real scroll
 *    element's own `scrollTop`, at the exact moment each touch starts —
 *    not a React state value computed by a separate scroll listener and
 *    handed in as a prop. A separately-computed boolean can go stale
 *    between the scroll event that set it and the touchstart that reads
 *    it, and iOS Safari's own elastic/rubber-band scrolling can report
 *    small non-zero scrollTop values even when a list is visually fully
 *    at rest at its top edge — a strict `=== 0` (or too tight a
 *    tolerance) check can leave the gesture unable to ever arm at all on
 *    exactly the device this needs to work on. AT_TOP_TOLERANCE below is
 *    deliberately forgiving about this; it doesn't weaken anything else,
 *    since actually triggering a refresh still requires a real ~60px
 *    downward drag on top of it.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

const THRESHOLD = 60;
const AT_TOP_TOLERANCE = 12;

export type PullState = "idle" | "pulling" | "ready" | "loading" | "done";

export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>(
  onRefresh: () => Promise<void>,
  scrollElRef: RefObject<HTMLElement | null>,
) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const containerRef = useRef<T | null>(null);

  const startY = useRef(0);
  const pullRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Local to this effect closure, not React state — these track the
    // gesture's own moment-to-moment truth (armed at touchstart, actually
    // moving by touchmove) and don't need to trigger a re-render on their
    // own; only `pull`/`state` (the visible parts) do.
    let armed = false;
    let tracking = false;

    const reset = () => {
      armed = false;
      tracking = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      const scrollEl = scrollElRef.current;
      armed = !!scrollEl && scrollEl.scrollTop <= AT_TOP_TOLERANCE;
      tracking = false;
      if (!armed) return;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!armed) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) return;
      tracking = true;
      // The real fix — see this file's own top-of-file doc for why this
      // has to be a genuine native listener to have any effect at all.
      e.preventDefault();
      const damped = Math.min(delta * 0.4, THRESHOLD + 20);
      setPull(damped);
      setState(damped >= THRESHOLD ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      if (!armed || !tracking) {
        reset();
        return;
      }
      reset();
      if (pullRef.current >= THRESHOLD) {
        setState("loading");
        setPull(THRESHOLD);
        onRefreshRef
          .current()
          .catch(() => {})
          .finally(() => {
            setState("done");
            setTimeout(() => {
              setPull(0);
              setState("idle");
            }, 600);
          });
      } else {
        setPull(0);
        setState("idle");
      }
    };

    // touchmove is the only one that needs { passive: false } — it's the
    // only one that ever calls preventDefault. touchcancel is handled the
    // same as touchend (reset/settle) — iOS can fire this instead of
    // touchend if the system itself interrupts a gesture (e.g. Control
    // Center, an incoming call, a system alert); without it, an
    // interrupted drag could leave the indicator stuck mid-pull forever.
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scrollElRef]);

  return { pull, state, containerRef };
}

export function PullIndicator({ pull, state }: { pull: number; state: PullState }) {
  const h = state === "loading" || state === "done" ? THRESHOLD : pull;
  if (h === 0 && state === "idle") return null;

  return (
    <div
      // shrink-0 is load-bearing, not decorative: this sits as a flex
      // child inside FeedContent's own flex-col scroll container, right
      // next to a sibling that has flex-1 (the list wrapper). Without
      // shrink-0, the flex layout algorithm is free to compress THIS
      // element's own explicit inline height down toward 0 in favor of
      // that flex-1 sibling claiming the space instead — which is exactly
      // what was happening: the inline `height: Npx` style was correctly
      // set the whole time (the drag-tracking logic was never the bug),
      // but the browser's own flex sizing silently overrode it, so
      // nothing ever actually became visible on screen, on any device.
      className="flex shrink-0 items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: h }}
    >
      {state === "loading" ? (
        <svg className="h-5 w-5 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
        </svg>
      ) : state === "done" ? (
        <span className="font-nunito text-[13px] text-muted">✓ Fresh gists loaded</span>
      ) : (
        <span className="font-nunito text-[13px] text-muted">
          {state === "ready" ? "Release to refresh" : "Pull to refresh"}
        </span>
      )}
    </div>
  );
}
