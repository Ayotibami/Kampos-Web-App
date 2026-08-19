"use client";

/**
 * Invisible side-effect component — calls useNetworkStatus with a reconnect
 * handler that flushes the offline gist queue. Mounted once in the root
 * layout so it persists across all navigations.
 */

import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { useGistStore } from "@/stores/gistStore";

export function OfflineSync() {
  useNetworkStatus(() => {
    useGistStore.getState().flushOfflineQueue().catch((err) => {
      console.error("[offline-sync] flush failed:", err);
    });
  });
  return null;
}
