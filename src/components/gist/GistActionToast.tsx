"use client";

/**
 * Two related toasts, one component, one shared bottom slot:
 *  - "offline" — a create/edit/delete/report just got queued while
 *    offline. Full-width bar, amber "pending" icon. See gistStore's
 *    notifyOfflineSave.
 *  - "success" — the same four actions, but the ONLINE case: the request
 *    actually went through for real. Compact icon-only chip, green
 *    "success" icon — nothing told a user this before, they had to infer
 *    it from the gist appearing/disappearing/updating. See gistStore's
 *    notifyActionSucceeded.
 *
 * Sharing one component/one slot (rather than two independent ones both
 * anchored to the same bottom position) means an offline-queued action and
 * a separately-succeeding online action can never land on screen at once
 * and visually collide — the later one simply replaces whichever was
 * showing, same as two of the same kind already did.
 *
 * Deliberately NOT shown for react/unreact, comments, or share — those are
 * frequent, low-stakes, and already fully reversible; a toast on every tap
 * would be far noisier than useful.
 *
 * Mounted once in the root layout (same pattern as ConnectivityPill) and
 * driven by window events rather than a prop — gistStore's create/update/
 * remove/report all fire these directly from their own branches, since
 * each one has multiple UI entry points and a global event is simpler than
 * threading a callback through all of them.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Check } from "@/components/ui/icons";
import type { OfflineGistSaveAction, GistActionSuccess } from "@/stores/gistStore";

const VISIBLE_MS = 5000;

const OFFLINE_COPY: Record<OfflineGistSaveAction, string> = {
  created: "Saved for later — no internet, this'll post the moment you're back online.",
  edited: "Saved for later — no internet, this'll update the moment you're back online.",
  deleted: "Queued for later — no internet, this'll be removed the moment you're back online.",
  reported: "Queued for later — no internet, this'll be reported the moment you're back online.",
};

const SUCCESS_COPY: Record<GistActionSuccess, string> = {
  created: "Your gist don land",
  edited: "Your gist don update",
  deleted: "We don commot am",
  reported: "Thanks! We go review am",
};

type ToastState = { kind: "offline"; action: OfflineGistSaveAction } | { kind: "success"; action: GistActionSuccess };

export function GistActionToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function show(next: ToastState) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setToast(next);
      hideTimerRef.current = window.setTimeout(() => setToast(null), VISIBLE_MS);
    }
    const onOffline = (e: Event) => {
      show({ kind: "offline", action: (e as CustomEvent<OfflineGistSaveAction>).detail });
    };
    const onSuccess = (e: Event) => {
      show({ kind: "success", action: (e as CustomEvent<GistActionSuccess>).detail });
    };
    window.addEventListener("kampos:gist-offline-saved", onOffline);
    window.addEventListener("kampos:gist-action-succeeded", onSuccess);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("kampos:gist-offline-saved", onOffline);
      window.removeEventListener("kampos:gist-action-succeeded", onSuccess);
    };
  }, []);

  // Same server/client first-paint mismatch guard as ConnectivityPill/
  // NewGistsPill — portals don't exist on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[1150] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {toast?.kind === "offline" && (
          <motion.div
            key="offline"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-none flex max-w-[420px] items-center gap-2.5 rounded-2xl bg-[#171a1f] py-2.5 pl-2.5 pr-4 shadow-lg"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ffc107]/20">
              <Check size={13} strokeWidth={3} color="#ffc107" />
            </span>
            <span className="font-nunito text-[13px] font-semibold leading-snug text-white/95">
              {OFFLINE_COPY[toast.action]}
            </span>
          </motion.div>
        )}
        {toast?.kind === "success" && (
          <motion.div
            key="success"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.94 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-none flex items-center gap-2 rounded-full bg-[#171a1f] py-2 pl-2 pr-4 shadow-lg"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6eed94]/20">
              <Check size={11} strokeWidth={3.2} color="#6eed94" />
            </span>
            <span className="font-nunito text-[12.5px] font-extrabold leading-none text-white/95">
              {SUCCESS_COPY[toast.action]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
