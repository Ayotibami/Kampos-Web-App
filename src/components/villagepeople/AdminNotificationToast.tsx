"use client";

/**
 * Global "something needs you" toast for admins — mounted once in the root
 * layout (src/app/layout.tsx), same slot as GistActionToast/AuthToast, so
 * it's present on every page of the app, consumer feed included: an
 * idiot/king account keeps admin powers no matter which profile is
 * currently active (see switchProfile's own doc comments), so "you're an
 * admin and something needs attention" shouldn't only surface while you
 * happen to be inside /villagepeople.
 *
 * Renders nothing at all for a non-admin (useIsAdmin() gates everything
 * below it, including ever subscribing to the socket) — zero cost for the
 * other 99% of accounts.
 *
 * Rides the SAME shared adminSocket connection (a ref-counted singleton —
 * this is its only subscriber now that the Moderation page's own per-tab
 * "N new — click to load" banners have been removed in favor of this one,
 * global mechanism; there's exactly one way to hear about a new report or
 * gist, not two competing ones). Fires everywhere, including while already
 * sitting on /villagepeople/moderation itself — this toast is now the only
 * affordance for noticing and loading new items, on that page or any other.
 *
 * Visual shell is AuthToast's — same dark pill, same top-8 slot, same
 * slide+fade — just clickable (tap navigates to the right tab and
 * dismisses) and top-8 is safe to reuse since AuthToast only ever shows on
 * logged-out auth screens, never at the same time an admin toast could.
 *
 * One slot per event type (reports, gists), not one-toast-per-event —
 * confirmed with real testing (firing 6 gists in a row) that without this,
 * a burst produces 6 stacked pills, which reads as noise, not a
 * notification. A slot instead accumulates a count and resets its own
 * 10-second visible timer on every new arrival of that same type.
 *
 * Clicking does a real, hard navigation (window.location.href), not
 * router.push — deliberately. The Moderation page's tabs seed their list
 * from a server-rendered prop once per mount and don't re-fetch on a
 * same-page query-string change, so a soft client-side nav while already
 * sitting on that page would flip the visible tab (or not even that,
 * without more plumbing) without ever loading the very item that made
 * this toast appear. A full navigation always re-runs the server fetch and
 * always lands on the correct tab, from anywhere in the app.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { FlagIconFill, AllGistsIconFill } from "@/components/ui/icons";
import { adminSocket } from "@/lib/adminSocket";
import { useIsAdmin } from "@/stores/authStore";

const VISIBLE_MS = 10_000;

// Fixed hexes, not theme tokens (--color-danger/--color-brand) — this
// pill's own background is deliberately always-dark chrome regardless of
// the site's light/dark theme (same as AuthToast/GistActionToast's own
// #171a1f/#6eed94), so a light-mode-tuned theme color would look muddy
// against it. Same actual brand identity colors as globals.css, just
// pinned rather than theme-swapped.
const REPORT_COLOR = "#d41d0c";
const GIST_COLOR = "#165abf";

export function AdminNotificationToast() {
  const isAdmin = useIsAdmin();

  const [reportsCount, setReportsCount] = useState(0);
  const [gistsCount, setGistsCount] = useState(0);
  const reportsTimerRef = useRef<number | null>(null);
  const gistsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    function bump(setCount: (fn: (n: number) => number) => void, timerRef: React.MutableRefObject<number | null>) {
      setCount((n) => n + 1);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCount(() => 0), VISIBLE_MS);
    }

    const offReport = adminSocket.subscribe("report:created", () => bump(setReportsCount, reportsTimerRef));
    const offGist = adminSocket.subscribe("gist:pending", () => bump(setGistsCount, gistsTimerRef));
    return () => {
      offReport();
      offGist();
      // Deliberately reading .current fresh here, not a variable captured
      // at effect-setup time — bump() keeps reassigning these refs for as
      // long as the component is mounted (a live "latest active timer id"
      // pointer, not a one-time snapshot), so only the value read AT
      // cleanup time is ever the right one to clear.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (reportsTimerRef.current) window.clearTimeout(reportsTimerRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (gistsTimerRef.current) window.clearTimeout(gistsTimerRef.current);
    };
  }, [isAdmin]);

  const goToReports = () => {
    if (reportsTimerRef.current) window.clearTimeout(reportsTimerRef.current);
    setReportsCount(0);
    window.location.href = "/villagepeople/moderation?tab=reports";
  };
  const goToGists = () => {
    if (gistsTimerRef.current) window.clearTimeout(gistsTimerRef.current);
    setGistsCount(0);
    window.location.href = "/villagepeople/moderation?tab=posts";
  };

  // Same server/client first-paint mismatch guard as every other portalled
  // pill in the app — portals don't exist on the server.
  const [mounted, setMounted] = useState(false);
  // Intentional: the whole point is that the FIRST client render matches
  // the server's (both null, since createPortal can't run server-side) and
  // only flips true in a post-hydration effect — same "mounted" idiom
  // AuthToast/GistActionToast/ConnectivityPill already use for this exact
  // reason. Starting from a lazy initializer instead would make the very
  // first client render diverge from SSR, which is the hydration mismatch
  // this pattern exists to avoid in the first place.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted || !isAdmin) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-8 z-[1150] flex flex-col items-center gap-2 px-6">
      <AnimatePresence>
        {gistsCount > 0 && (
          <motion.button
            key="gists"
            type="button"
            onClick={goToGists}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto flex w-full max-w-[360px] items-center gap-2.5 rounded-2xl bg-[#171a1f] py-3 pl-3 pr-4 text-left shadow-lg transition hover:brightness-110"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${GIST_COLOR}33` }}>
              <AllGistsIconFill size={13} color={GIST_COLOR} />
            </span>
            <span className="min-w-0 font-nunito text-[13px] font-semibold leading-snug text-white/95">
              {gistsCount} new post{gistsCount === 1 ? "" : "s"} pending review
            </span>
          </motion.button>
        )}
        {reportsCount > 0 && (
          <motion.button
            key="reports"
            type="button"
            onClick={goToReports}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="pointer-events-auto flex w-full max-w-[360px] items-center gap-2.5 rounded-2xl bg-[#171a1f] py-3 pl-3 pr-4 text-left shadow-lg transition hover:brightness-110"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${REPORT_COLOR}33` }}>
              <FlagIconFill size={13} color={REPORT_COLOR} />
            </span>
            <span className="min-w-0 font-nunito text-[13px] font-semibold leading-snug text-white/95">
              {reportsCount} new report{reportsCount === 1 ? "" : "s"}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
