"use client";

/**
 * Bridges the three silent redirects in the auth flow — signup, OTP
 * verify, and forgot-password all land you on a fresh screen with zero
 * acknowledgment that the previous step worked. Same visual shell as
 * GistActionToast's own bar variant, but top-anchored: these only ever
 * appear once, right as you arrive at a screen, before you've done
 * anything else there — closer to "here's this new screen and why" (what
 * ConnectivityPill/NewGistsPill already announce at the top) than
 * "feedback on my last tap" (what the bottom-anchored gist toasts are
 * for). Doesn't share GistActionToast's plumbing — different events,
 * different screens, the two never need to coexist.
 *
 * top-8 — level with where the desktop wordmark sits (AuthShell's own
 * `top-8` corner anchor), well above where any screen's heading text
 * lands (AuthShell centers its form content vertically, so the toast
 * needs to live in the dead space above it, not at a fixed distance from
 * the top that a short form's heading can still reach up into). Sits
 * above ConnectivityPill's own band (top-24) rather than below it —
 * opposite of NewGistsPill's fix for the same collision, but the same
 * underlying idea: don't let the two overlap.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Check } from "@/components/ui/icons";

export type AuthToastAction = "signup" | "otp-verified" | "code-sent";

const COPY: Record<AuthToastAction, string> = {
  signup: "Account don ready — abeg verify your email",
  "otp-verified": "Email don verify",
  "code-sent": "We don send the code — check your email",
};

// Longer copy than the gist toasts (full sentences, not one word) — a
// touch longer on screen so there's time to actually read it.
const VISIBLE_MS = 5500;

export function notifyAuthToast(action: AuthToastAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthToastAction>("kampos:auth-toast", { detail: action }));
}

export function AuthToast() {
  const [action, setAction] = useState<AuthToastAction | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function onToast(e: Event) {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      setAction((e as CustomEvent<AuthToastAction>).detail);
      hideTimerRef.current = window.setTimeout(() => setAction(null), VISIBLE_MS);
    }
    window.addEventListener("kampos:auth-toast", onToast);
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      window.removeEventListener("kampos:auth-toast", onToast);
    };
  }, []);

  // Same server/client first-paint mismatch guard as every other portalled
  // pill in the app — portals don't exist on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-8 z-[1150] flex justify-center px-6">
      <AnimatePresence>
        {action && (
          <motion.div
            key={action}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            // max-w + leading-snug, no whitespace-nowrap — these run
            // longer than the gist toasts' one or two words, so this has
            // to actually wrap cleanly inside its own pill on a narrow
            // screen instead of being told to stay on one line. items-center
            // (not items-start) so the icon centers against the full text
            // block even when it wraps to two lines, same as every other
            // toast in the app already does.
            className="pointer-events-none flex w-full max-w-[360px] items-center gap-2.5 rounded-2xl bg-[#171a1f] py-3 pl-3 pr-4 shadow-lg"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#6eed94]/20">
              <Check size={13} strokeWidth={3} color="#6eed94" />
            </span>
            <span className="min-w-0 font-nunito text-[13px] font-semibold leading-snug text-white/95">
              {COPY[action]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
