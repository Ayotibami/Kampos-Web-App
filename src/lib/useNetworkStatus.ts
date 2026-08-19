/**
 * Tracks online/offline status via `navigator.onLine` + `online`/`offline`
 * events. When transitioning back online, automatically calls `onReconnect`
 * (the offline-queue flush) so queued mutations replay without the user
 * having to do anything.
 */

"use client";

import { useEffect, useRef, useState } from "react";

export function useNetworkStatus(onReconnect?: () => void) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect; // always current, never a dep

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      onReconnectRef.current?.();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // stable effect — no listener churn

  return isOnline;
}
