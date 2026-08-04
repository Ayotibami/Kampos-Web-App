"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { Illustration, type IllustrationName } from "@/components/brand/illustrations";
import { PhoneKappyOrbit } from "@/components/brand/PhoneKappyOrbit";
import { KappyOpportunitiesOrbit } from "@/components/brand/KappyOpportunitiesOrbit";
import { ONBOARDING } from "@/lib/brand";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
import KappyWaving from "@/assets/illustrations/KappyWaving.png";

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
  // Purely local, no backend — a returning visitor who's already seen this
  // carousel skips straight to /welcome instead of sitting through it
  // again every time they open the site.
  const [checked, setChecked] = useState(false);
  const slide = ONBOARDING[index];
  const isLast = index === ONBOARDING.length - 1;

  useEffect(() => {
    if (hasSeenOnboarding()) {
      router.replace("/welcome");
    } else {
      setChecked(true);
    }
  }, [router]);

  const next = () => {
    if (isLast) {
      markOnboardingSeen();
      router.replace("/welcome");
    } else {
      setIndex((i) => i + 1);
    }
  };

  if (!checked) return null;

  return (
    <div className="flex min-h-dvh w-full flex-col bg-surface md:h-dvh md:flex-row md:overflow-hidden">
      {/* Illustration — fills the entire half on desktop (no padding boxing
          it in), top block on mobile (unchanged, still capped so it doesn't
          crowd the copy below it there). */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-brand/[0.06] px-6 pt-10 md:flex-[1.1] md:p-0">
        {/* Tiled brand doodle backdrop, behind Kappy — same asset AppShell's
            landscape backdrop uses, bumped up in opacity here since this
            illustration half IS the visual, not a supporting backdrop
            behind a small card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-50 dark:invert"
          style={{
            backgroundImage: "url('/brand/doodles.svg')",
            backgroundRepeat: "repeat",
            backgroundSize: "280px auto",
          }}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            className="flex h-full w-full items-center justify-center"
          >
            {/* 80% of the half, centered — full 100% read as cramped/
                touching the edges; this is the "large and immersive" sweet
                spot with breathing room on all sides. Slide 0 uses a real
                raster PNG (Next/Image, proper responsive sizing) instead of
                the SVG illustration set — the old Kappyswag.svg was
                actually a rasterized image smuggled inside SVG markup,
                which is what caused the blur/crop; this is a clean asset. */}
            {index === 0 ? (
              // Cropped tight on the upper body/wave, not shrunk to fit —
              // object-cover + object-top fills the whole frame and lets
              // the legs fall outside it, instead of letterboxing a
              // full-body shot down to fit. Still fully responsive: `fill`
              // + a relatively-sized parent means it scales with the
              // viewport at any breakpoint, it's just cropping instead of
              // scaling-to-fit.
              <div className="relative h-full max-h-[45vh] w-full md:h-[95%] md:max-h-none md:w-[95%]">
                <Image
                  src={KappyWaving}
                  alt="Kappy waving"
                  fill
                  priority
                  sizes="(min-width: 768px) 45vw, 95vw"
                  className="object-cover object-top"
                />
              </div>
            ) : index === 1 ? (
              <PhoneKappyOrbit className="h-full max-h-[45vh] w-full md:h-[95%] md:max-h-none md:w-[95%]" />
            ) : index === 2 ? (
              <KappyOpportunitiesOrbit className="h-full max-h-[45vh] w-full md:h-[95%] md:max-h-none md:w-[95%]" />
            ) : (
              <Illustration
                name={slide.illustration as IllustrationName}
                className="h-full max-h-[40vh] w-auto max-w-full md:h-[95%] md:max-h-none md:w-[95%] md:max-w-none"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Copy + controls half */}
      <div className="flex flex-col px-6 pb-10 pt-6 md:px-16 md:py-12">
        {/* Brand anchor — pinned to the top of its own half, not part of
            the centered content group below (previously it was swept into
            the same justify-center block as the copy, which read as
            cramped and didn't feel like real page-level branding). Bigger
            and with real breathing room under it. */}
        <div className="mb-16 hidden md:block">
          <Wordmark accentClassName="text-brand" className="text-2xl" />
        </div>

        <div className="flex flex-1 flex-col md:justify-center">
          <div className="min-h-[8.5rem] space-y-4 text-center md:min-h-0 md:space-y-5 md:text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
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
          <div className="mt-auto space-y-6 pt-6 md:mt-14 md:max-w-xs md:pt-0">
            <ProgressDots count={ONBOARDING.length} index={index} onDotClick={setIndex} />
            <Button onClick={next}>{isLast ? "Let's go" : "Continue"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
