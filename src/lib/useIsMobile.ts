"use client";

import { useLayoutEffect, useState } from "react";

const QUERY = "(max-width: 767px)"; // matches Tailwind's `md` breakpoint

/** Shared by GistStack (peek-hiding), GistCard/ProfileGistCard/FeedGistCard
 * (which reaction UI mounts) — a single source so all of them agree on
 * exactly the same breakpoint.
 *
 * Always starts `false` — including on the client's very first render, not
 * just the server's — because that first client render is the one React
 * hydration actually diffs against the server's HTML. Reading the real
 * `matchMedia` value synchronously there (as this used to) matches the
 * server fine on desktop but not on an actual phone, where the server (no
 * `window`) rendered the desktop reaction row while that very first client
 * render already swapped to the mobile one underneath it — a genuine
 * hydration mismatch, not just a cosmetic one, surfaced by any SSR page
 * using one of these cards (the feed, a profile, a shared gist link) opened
 * on a narrow viewport.
 *
 * `useLayoutEffect`, not `useEffect`, is what keeps this from trading that
 * mismatch for a visible flash instead — it fires synchronously after the
 * DOM commits but before the browser paints, so the correction to the real
 * value lands before anything is actually on screen. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia(QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
