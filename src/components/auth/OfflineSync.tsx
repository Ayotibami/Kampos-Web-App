"use client";

/**
 * Invisible side-effect component — calls useNetworkStatus with a reconnect
 * handler that flushes the offline gist queue. Mounted once in the root
 * layout so it persists across all navigations.
 */

import { useEffect } from "react";
import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { useGistStore } from "@/stores/gistStore";

export function OfflineSync() {
  const isOnline = useNetworkStatus(() => {
    useGistStore.getState().flushOfflineQueue().catch((err) => {
      console.error("[offline-sync] flush failed:", err);
    });
  });

  // useNetworkStatus's callback above only fires on a genuine
  // offline→online *transition*. That misses a real case: something got
  // queued in an earlier session, the tab was closed while still offline,
  // and this page loaded fresh already back online — no transition ever
  // happens for it to notice, so a stale queue would sit untouched
  // indefinitely. flush() is safe to call speculatively (a no-op on an
  // empty queue, and now guarded against overlapping with the transition
  // path too — see offlineQueue.ts's inFlight lock), so just try once on
  // mount if we're already online.
  useEffect(() => {
    if (isOnline) {
      useGistStore.getState().flushOfflineQueue().catch((err) => {
        console.error("[offline-sync] initial flush failed:", err);
      });
    }
    // Deliberately mount-only — the transition case above already covers
    // isOnline flipping later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
