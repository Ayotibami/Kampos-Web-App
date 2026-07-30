"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { Illustration, type IllustrationName } from "@/components/brand/illustrations";
import { ONBOARDING } from "@/lib/brand";

/**
 * Onboarding carousel — Kappy the mascot introduces Kampos across 3 slides,
 * then hands off to the welcome screen. Ported from the mobile index screen.
 * Fully responsive: edge-to-edge on phones, centered panel on desktop.
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
    <AppShell>
      <div className="flex flex-1 flex-col px-6 py-10 md:px-8">
        {/* Illustration */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
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
                className="h-full max-h-[40vh] w-auto max-w-full"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Copy */}
        <div className="min-h-[8.5rem] space-y-3 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <h1 className="font-poppins text-xl font-extrabold text-ink sm:text-2xl">
                {slide.header}
              </h1>
              <p className="mx-auto max-w-sm font-poppins text-sm leading-relaxed text-muted">
                {slide.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-auto space-y-6 pt-4">
          <ProgressDots count={ONBOARDING.length} index={index} />
          <Button onClick={next}>{isLast ? "Let's go" : "Continue"}</Button>
        </div>
      </div>
    </AppShell>
  );
}
