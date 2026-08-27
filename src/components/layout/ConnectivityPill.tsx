"use client";

/**
 * Global "Internet don vanish" / "Internet don show" status pill. Mounted
 * once in the root layout (not feed-scoped like NewGistsPill) so it's
 * visible no matter which page connectivity changes on.
 *
 * Listens to the raw `online`/`offline` events itself rather than reusing
 * useNetworkStatus — that hook fires its reconnect callback immediately on
 * `online`, which is right for OfflineSync's queue-flush but wrong here:
 * this pill needs its own debounce (don't flash "vanish" for a one-second
 * blip) and its own memory of whether it actually showed the offline pill
 * before deciding whether "show" is worth announcing.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Wifi, WifiOff } from "@/components/ui/icons";

// A blip shorter than this never shows anything — most flaky-connection
// hiccups resolve on their own before a person could read a pill anyway.
const OFFLINE_DEBOUNCE_MS = 600;
// How long each pill stays up once shown.
const VISIBLE_MS = 4000;

type PillState = { kind: "offline" | "online" } | null;

export function ConnectivityPill() {
  const [state, setState] = useState<PillState>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  // Tracks whether the "vanish" pill actually made it on screen for the
  // *current* outage — only then is "show" worth announcing when it ends.
  const shownOfflineRef = useRef(false);

  useEffect(() => {
    function showPill(kind: "offline" | "online") {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setState({ kind });
      hideTimerRef.current = window.setTimeout(() => setState(null), VISIBLE_MS);
    }

    function goOffline() {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        shownOfflineRef.current = true;
        showPill("offline");
      }, OFFLINE_DEBOUNCE_MS);
    }

    function goOnline() {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (shownOfflineRef.current) {
        shownOfflineRef.current = false;
        showPill("online");
      }
    }

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Same server/client first-paint mismatch guard as NewGistsPill — portals
  // don't exist on the server, so gate on a mount effect instead of
  // `typeof document` during render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isOffline = state?.kind === "offline";

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[1150] flex justify-center">
      <AnimatePresence>
        {state && (
          <motion.div
            key={state.kind}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pointer-events-none flex items-center gap-2 rounded-full py-2 pl-2 pr-3.5 font-nunito text-[13px] font-bold text-white/95 shadow-lg ring-1 ring-white/10 backdrop-blur-xl backdrop-saturate-150"
            style={{ backgroundColor: "rgba(10, 14, 26, 0.55)" }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: isOffline ? "rgba(255, 193, 7, 0.22)" : "rgba(110, 237, 148, 0.22)",
              }}
            >
              {isOffline ? (
                <WifiOff size={12} strokeWidth={2.6} color="#ffc107" />
              ) : (
                <Wifi size={12} strokeWidth={2.6} color="#6eed94" />
              )}
            </span>
            {isOffline ? "Internet don vanish" : "Internet don show"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
