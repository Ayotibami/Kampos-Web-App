"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Only the feed has its own fully self-contained h-dvh scroll shell — see
// the `feed-locked` rule in globals.css for why this matters (iOS Safari
// whole-page rubber-band bounce). Every other screen (settings, profile,
// forms, onboarding) has no scroll shell of its own and genuinely relies on
// normal document scroll on mobile, so this must stay scoped to just this
// route, never applied globally.
const SCROLL_LOCKED_ROUTE = /^\/feed(\/|$)/;

/** The one place that mutates the `feed-locked` class on `<html>` — same
 * per-route-toggle pattern as ThemeRouteSync, kept as its own component
 * since this is an unrelated concern (layout containment, not theming).
 * Mounted once in the root layout; re-syncs on every client-side
 * navigation. */
export function FeedScrollLock() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.toggle("feed-locked", SCROLL_LOCKED_ROUTE.test(pathname));
  }, [pathname]);

  return null;
}
