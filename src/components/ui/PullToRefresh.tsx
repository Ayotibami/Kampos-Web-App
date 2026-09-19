"use client";

/**
 * Pull-to-refresh hook — tracks a downward touch drag and, past a
 * threshold, calls `onRefresh`. Returns pull distance + state for the
 * indicator, and a ref to attach to the container the gesture should
 * listen on.
 *
 * `enabled` gates the whole gesture. This isn't optional polish: on the
 * feed, the vertical drag is ALSO how you swipe to the previous gist (see
 * useOverscrollNav, attached directly to each card). Native touch events
 * bubble past a card's own preventDefault() up to this handler regardless
 * of who "claimed" the gesture first, so without an explicit gate, a
 * longer/slower swipe-to-previous could simultaneously trigger a full feed
 * reload — two unrelated things firing off one motion. The only place a
 * downward pull doesn't already mean "go to the previous gist" is when
 * you're on the very first one (there's nothing before it to go to), so
 * callers should only enable this while viewing that first card.
 *
 * Native `addEventListener` calls (via a ref + effect), NOT React's own
 * onTouchStart/onTouchMove JSX props — this is the actual fix for "works
 * in a quick test, does nothing on a real iPhone." React registers its
 * touchmove listener as passive by default (Chrome/Safari's own
 * recommended default, for scroll performance), which silently means
 * `preventDefault()` inside a React onTouchMove handler does nothing at
 * all — there was never a real handler here calling it in the first
 * place, but even adding one the "normal" React way wouldn't have worked.
 * Without a real preventDefault, iOS Safari is free to treat a downward
 * drag at the top of the list as ITS OWN gesture (a rubber-band bounce, or
 * worse, its own native "pull down to reload the page") at the same time
 * this hook is trying to track it as a custom pull-to-refresh — on a
 * horizontally-swiped card stack (the old feed design) this never
 * mattered, since Safari had no reason to treat a horizontal swipe as a
 * vertical scroll gesture; an all-vertical list is exactly where the two
 * start fighting over the same touch. Attaching the real DOM listener
 * ourselves with `{ passive: false }` is what actually lets
 * `preventDefault()` take effect — called only once we're sure this really
 * is a downward pull (delta > 0), so ordinary scrolling elsewhere on the
 * page is completely unaffected.
 */

import { useEffect, useRef, useState } from "react";

const THRESHOLD = 60;

export type PullState = "idle" | "pulling" | "ready" | "loading" | "done";

export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>(
  onRefresh: () => Promise<void>,
  enabled = true,
) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const containerRef = useRef<T | null>(null);

  // Mirrored in refs so the native listeners (attached once, see the
  // empty-deps effect below) always read the CURRENT value instead of
  // whatever was current the one time the listener was attached — the
  // classic stale-closure trap for a native addEventListener callback
  // that closes over component state/props.
  const startY = useRef(0);
  const pullingRef = useRef(false);
  const pullRef = useRef(0);
  const enabledRef = useRef(enabled);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      startY.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) {
        if (pullingRef.current) {
          pullingRef.current = false;
          setPull(0);
          setState("idle");
        }
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) return;
      pullingRef.current = true;
      // The actual fix — see this file's own top-of-file doc for why this
      // has to be a real native listener to have any effect at all.
      e.preventDefault();
      const damped = Math.min(delta * 0.4, THRESHOLD + 20);
      setPull(damped);
      setState(damped >= THRESHOLD ? "ready" : "pulling");
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
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
    // only one that ever calls preventDefault. start/end stay passive,
    // same as their old React-synthetic defaults, since neither needs to
    // block anything.
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return { pull, state, containerRef };
}

export function PullIndicator({ pull, state }: { pull: number; state: PullState }) {
  const h = state === "loading" || state === "done" ? THRESHOLD : pull;
  if (h === 0 && state === "idle") return null;

  return (
    <div className="flex items-center justify-center overflow-hidden transition-[height] duration-200" style={{ height: h }}>
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
