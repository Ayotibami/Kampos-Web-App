"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)"; // matches Tailwind's `md` breakpoint

/** Shared by GistStack (peek-hiding) and GistCard (which reaction UI mounts)
 * — a single source so both agree on exactly the same breakpoint. */
export function useIsMobile() {
  // Lazy initializer reads the real value synchronously on mount instead of
  // defaulting to false-then-correcting-in-an-effect — avoids a pointless
  // extra render and the "setState directly in an effect" smell for what's
  // really just a one-time initial read.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
