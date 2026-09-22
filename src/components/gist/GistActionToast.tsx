"use client";

/**
 * Three related toasts, one component, one shared bottom slot:
 *  - "offline" — a create/edit/delete/report just got queued while
 *    offline. Full-width bar, amber "pending" icon. See gistStore's
 *    notifyOfflineSave.
 *  - "success" — the same four actions, but the ONLINE case: the request
 *    actually went through for real. Compact icon-only chip, green
 *    "success" icon — nothing told a user this before, they had to infer
 *    it from the gist appearing/disappearing/updating. See gistStore's
 *    notifyActionSucceeded.
 *  - "error" — create/edit only, the ONLINE request genuinely failed after
 *    an optimistic close. Same full-width wrapping shape as "offline" (the
 *    copy is too long for a short chip), red "error" icon. Fired alongside
 *    CreateGistSheet reopening itself with the draft intact — see
 *    gistStore's notifyActionFailed.
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
 *
 * Also covers Spot's own report-success pill (spotStore's
 * notifySpotActionSucceeded) — same slot, same compact-chip shape as
 * Gist's "success" kind, kept as its own discriminated-union member rather
 * than reusing Gist's event/type since it genuinely isn't a Gist action.
 * Still named GistActionToast (not renamed) to avoid unnecessary churn on
 * otherwise-working code for what's currently one extra action.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Check, AlertCircle } from "@/components/ui/icons";
import type { OfflineGistSaveAction, GistActionSuccess, GistActionFailure } from "@/stores/gistStore";
import type { SpotActionSuccess } from "@/stores/spotStore";

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

const FAILURE_COPY: Record<GistActionFailure, string> = {
  created: "We were not able to create your gist, please try again",
  edited: "We were not able to save your changes, please try again",
};

const SPOT_SUCCESS_COPY: Record<SpotActionSuccess, string> = {
  reported: "Thanks! We go review am",
  posted: "Your Spot don land",
};

type ToastState =
  | { kind: "offline"; action: OfflineGistSaveAction }
  | { kind: "success"; action: GistActionSuccess }
  | { kind: "error"; action: GistActionFailure }
  | { kind: "spot-success"; action: SpotActionSuccess };

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
    const onFailure = (e: Event) => {
      show({ kind: "error", action: (e as CustomEvent<GistActionFailure>).detail });
    };
    const onSpotSuccess = (e: Event) => {
      show({ kind: "spot-success", action: (e as CustomEvent<SpotActionSuccess>).detail });
    };
    window.addEventListener("kampos:gist-offline-saved", onOffline);
    window.addEventListener("kampos:gist-action-succeeded", onSuccess);
    window.addEventListener("kampos:gist-action-failed", onFailure);
    window.addEventListener("kampos:spot-action-succeeded", onSpotSuccess);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("kampos:gist-offline-saved", onOffline);
      window.removeEventListener("kampos:gist-action-succeeded", onSuccess);
      window.removeEventListener("kampos:gist-action-failed", onFailure);
      window.removeEventListener("kampos:spot-action-succeeded", onSpotSuccess);
    };
  }, []);

  // Same server/client first-paint mismatch guard as ConnectivityPill —
  // portals don't exist on the server.
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
        {toast?.kind === "spot-success" && (
          // Identical shape to Gist's own "success" chip — same slot,
          // same compact pill, just Spot's own copy dictionary.
          <motion.div
            key="spot-success"
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
              {SPOT_SUCCESS_COPY[toast.action]}
            </span>
          </motion.div>
        )}
        {toast?.kind === "error" && (
          // Same shape as the offline bar, not the compact success pill —
          // "We were not able to create your gist, please try again" is too
          // long to read as a short chip, so this one wraps like offline's
          // longer copy does too.
          <motion.div
            key="error"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-none flex max-w-[420px] items-center gap-2.5 rounded-2xl bg-[#171a1f] py-2.5 pl-2.5 pr-4 shadow-lg"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/20">
              <AlertCircle size={13} strokeWidth={2.6} color="#d41d0c" />
            </span>
            <span className="font-nunito text-[13px] font-semibold leading-snug text-white/95">
              {FAILURE_COPY[toast.action]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
