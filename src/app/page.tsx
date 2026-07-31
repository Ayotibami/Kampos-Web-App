"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { Illustration, type IllustrationName } from "@/components/brand/illustrations";
import { ONBOARDING } from "@/lib/brand";

/**
 * Onboarding carousel — Kappy the mascot introduces Kampos across 3 slides,
 * then hands off to the welcome screen. Ported from the mobile index screen.
 *
 * Mobile keeps the original stacked layout (illustration on top, copy below,
 * controls pinned to the bottom), edge-to-edge, no chrome.
 *
 * Desktop is a full-bleed split screen — illustration fills the whole left
 * half (its own tinted backdrop, no card/rounded corners/shadow boxing it
 * in, since the illustration itself is the visual now), heading/copy/
 * controls fill the right half. Deliberately not using AppShell's
 * "landscape" card treatment here — once the illustration has real
 * presence, a rounded card floating on a doodle backdrop was just an inset
 * white rectangle with barely any backdrop showing around it.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = ONBOARDING[index];
  const isLast = index === ONBOARDING.length - 1;

  const next = () => {
    if (isLast) router.replace("/welcome");
    else setIndex((i) => i + 1);
  };

  return (
    <div className="flex min-h-dvh w-full flex-col bg-surface md:flex-row">
      {/* Illustration — full-bleed hero half on desktop, top block on mobile. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-brand/[0.06] px-6 pt-10 md:flex-[1.1] md:px-10 md:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            className="flex h-full w-full items-center justify-center"
          >
            <Illustration
              name={slide.illustration as IllustrationName}
              className="h-full max-h-[40vh] w-auto max-w-full md:max-h-[70vh]"
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Copy + controls half */}
      <div className="flex flex-col px-6 pb-10 pt-6 md:flex-1 md:justify-center md:px-16 md:py-10">
        {/* Brand anchor — desktop only, this flow has no nav bar at all. */}
        <div className="mb-10 hidden md:block">
          <Wordmark accentClassName="text-brand" className="text-lg" />
        </div>

        <div className="min-h-[8.5rem] space-y-3 text-center md:min-h-0 md:text-left">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <h1 className="font-poppins text-xl font-extrabold text-ink sm:text-2xl md:text-3xl">
                {slide.header}
              </h1>
              <p className="mx-auto max-w-sm font-poppins text-sm leading-relaxed text-muted md:mx-0 md:max-w-sm md:text-base">
                {slide.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-auto space-y-6 pt-6 md:mt-10 md:max-w-xs md:pt-0">
          <ProgressDots count={ONBOARDING.length} index={index} />
          <Button onClick={next}>{isLast ? "Let's go" : "Continue"}</Button>
        </div>
      </div>
    </div>
  );
}
