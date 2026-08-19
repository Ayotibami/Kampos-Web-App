"use client";

/**
 * Pull-to-refresh hook — tracks touch/mouse drag at the top of the
 * scrollable area. Returns pull distance + state for the indicator,
 * and event handlers to spread onto the scrollable container.
 */

import { useCallback, useRef, useState } from "react";
import type { TouchEvent } from "react";

const THRESHOLD = 60;

export type PullState = "idle" | "pulling" | "ready" | "loading" | "done";

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const startY = useRef(0);
  const pullingRef = useRef(false);

  const canPull = useCallback((el: HTMLElement) => el.scrollTop <= 0, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (!canPull(e.currentTarget as HTMLElement)) return;
    startY.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [canPull]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!canPull(e.currentTarget as HTMLElement)) {
      pullingRef.current = false; setPull(0); setState("idle"); return;
    }
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) return;
    pullingRef.current = true;
    const damped = Math.min(delta * 0.4, THRESHOLD + 20);
    setPull(damped);
    setState(damped >= THRESHOLD ? "ready" : "pulling");
  }, [canPull]);

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

