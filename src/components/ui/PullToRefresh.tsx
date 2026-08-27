"use client";

/**
 * Pull-to-refresh hook — tracks a downward touch drag and, past a
 * threshold, calls `onRefresh`. Returns pull distance + state for the
 * indicator, and event handlers to spread onto the container.
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
 */

import { useCallback, useRef, useState } from "react";
import type { TouchEvent } from "react";

const THRESHOLD = 60;

export type PullState = "idle" | "pulling" | "ready" | "loading" | "done";

export function usePullToRefresh(onRefresh: () => Promise<void>, enabled = true) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const startY = useRef(0);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    startY.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [enabled]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) {
      if (pullingRef.current) { pullingRef.current = false; setPull(0); setState("idle"); }
      return;
    }
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) return;
    pullingRef.current = true;
    const damped = Math.min(delta * 0.4, THRESHOLD + 20);
    setPull(damped);
    setState(damped >= THRESHOLD ? "ready" : "pulling");
  }, [enabled]);

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pull >= THRESHOLD) {
      setState("loading"); setPull(THRESHOLD);
      try { await onRefresh(); } finally {
        setState("done");
        setTimeout(() => { setPull(0); setState("idle"); }, 600);
      }
    } else {
      setPull(0); setState("idle");
    }
  }, [pull, onRefresh]);

  return { pull, state, onTouchStart, onTouchMove, onTouchEnd };
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

