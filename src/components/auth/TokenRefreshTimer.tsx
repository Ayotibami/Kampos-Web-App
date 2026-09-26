"use client";

import { useEffect } from "react";
import { tryRefresh } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

// The backend issues a 15-minute access token (see middleware.ts's own
// comment on ACCESS_COOKIE). Refreshing well before that, on a plain
// background timer, keeps the cookie perpetually fresh while the app is
// actually in use — comfortable margin, not cutting it close to 15.
const PROACTIVE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Mounted once at the root, alongside SessionWatcher. Both of the app's
 * OTHER two refresh paths are reactive — the axios interceptor only
 * refreshes once a request has already come back 401, and middleware.ts
 * only refreshes once a navigation lands on a token that's already
 * expired/expiring — and middleware's own refresh is a live, awaited fetch
 * to the backend sitting directly in front of that navigation's own
 * response, so whichever tab-tap happens to land in that ~15-minute window
 * pays for a real round trip (worse, a real Render cold-start round trip)
 * before the page even starts rendering. That's what made switching tabs
 * feel randomly slow every so often, on every route equally, regardless of
 * any per-route caching — the delay was happening one layer before any of
 * that ever got a chance to run.
 *
 * This is the missing THIRD path: refresh proactively, on a timer, before
 * anything is ever on the verge of expiring, so middleware's own reactive
 * check almost always finds an already-fresh token during real use and
 * takes its instant, no-fetch fast path instead. Middleware's reactive
 * refresh stays exactly as-is as the fallback for whatever this timer
 * can't reach (a backgrounded tab throttling setInterval, the browser
 * having been closed and reopened) — this doesn't replace that safety net,
 * it just keeps the app off it during ordinary, actively-used sessions.
 */
export function TokenRefreshTimer() {
  const authState = useAuthStore((s) => s.authState);

  useEffect(() => {
    if (authState !== "active") return;
    const id = setInterval(() => {
      void tryRefresh();
    }, PROACTIVE_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [authState]);

  return null;
}
