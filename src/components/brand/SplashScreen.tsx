"use client";

/**
 * Brand splash shown on every fresh load of the plain website — a genuine
 * hard reload or first visit, never on ordinary client-side navigation
 * between pages, since this lives in the root layout and only ever mounts
 * once per page load regardless of how many routes get visited afterward.
 *
 * Deliberately shown for a minimum duration rather than just "until the
 * page is ready" — most pages here are server-rendered and ready almost
 * instantly, so a purely readiness-gated splash would barely register at
 * all. A short guaranteed hold is what makes it read as an intentional
 * "app opening" moment instead of a flicker.
 *
 * Skipped entirely once actually installed (launched from a home-screen
 * icon) — the OS already shows its own native launch splash straight from
 * the manifest in that case (same blue, same mark, since that's what the
 * manifest points at), and stacking this one on top of it would just look
 * like the splash showing twice in a row. Can't know that server-side
 * (standalone detection is a client-only check), so the very first paint
 * still renders this by default like a normal browser tab would — the
 * effect below corrects it within a frame, which in practice is masked by
 * the OS's own splash still being up while the page is that early into
 * loading anyway.
 *
 * The entrance animation here is deliberately the ONLY place any splash
 * animation can exist at all — both native OS launch splashes (iOS's
 * generated startup images, Android's manifest-driven one) are static by
 * hard platform design, shown before any JS has even loaded, on every
 * platform, for everyone. This is the one splash moment that's actually
 * capable of moving.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import Image from "next/image";
import { isStandalone } from "@/lib/pwaInstall";

const MIN_VISIBLE_MS = 1300;
const FADE_MS = 300;
// Belt-and-suspenders against this remounting somewhere it shouldn't (a
// hard navigation/full reload triggered from deep in the app, rather than
// the genuine first load this is meant for) — sessionStorage survives
// exactly as long as the tab does, so once shown, it stays skipped for
// the rest of that tab's life and only comes back on a real fresh open
// (new tab, or the PWA relaunching), which is the one moment this should
// ever actually appear. Every other "a page is loading" moment already has
// its own route-level loading.tsx/skeleton — this is not that.
const SHOWN_KEY = "kampos-splash-shown";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const markControls = useAnimationControls();
  const textControls = useAnimationControls();

  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SHOWN_KEY) === "1";
    } catch {
      // Private-browsing/storage-blocked — fall through and just show it;
      // worst case is the same behavior this had before this fix existed.
    }
    if (alreadyShown || isStandalone()) {
      setVisible(false);
      return;
    }
    try {
      sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // Nothing to do if storage is unavailable — this run just won't be
      // remembered, same as the alreadyShown read above.
    }

    // Spring in with a real overshoot, then settle into a slow, subtle
    // breathing loop for however long the splash is still up — reads as
    // alive without being distracting, and never fights the fade-out
    // since exit is handled by AnimatePresence separately.
    //
    // Deliberately never animates FROM opacity 0 on either the mark or the
    // text — the background itself is already fully opaque the instant
    // this mounts, so a fade-in on top of that left a real gap of plain
    // blue with nothing on it before anything appeared. Both start fully
    // visible, already in view, and only ever *move* into their resting
    // position/scale — there's no frame where the screen looks empty.
    (async () => {
      await markControls.start({
        scale: 1,
        transition: { type: "spring", stiffness: 260, damping: 16 },
      });
      markControls.start({
        scale: [1, 1.045, 1],
        transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
      });
    })();
    textControls.start({
      y: 0,
      transition: { delay: 0.08, type: "spring", stiffness: 280, damping: 20 },
    });

    const timer = window.setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-brand"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: "easeOut" }}
        >
          <div className="flex flex-1 items-center justify-center">
            <motion.div initial={{ scale: 0.72 }} animate={markControls}>
              <Image
                src="/icons/icon-mark-white.png"
                alt=""
                width={1024}
                height={1024}
                priority
                style={{ width: "clamp(190px, 22vw, 320px)", height: "clamp(190px, 22vw, 320px)" }}
              />
            </motion.div>
          </div>
          <motion.span
            initial={{ y: 14 }}
            animate={textControls}
            className="font-nunito font-extrabold tracking-tight text-white"
            style={{
              fontSize: "clamp(28px, 3.5vw, 56px)",
              marginBottom: "clamp(48px, 6vw, 100px)",
            }}
          >
            Kampos
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
