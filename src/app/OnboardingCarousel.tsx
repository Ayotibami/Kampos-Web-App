"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { PhoneKappyOrbit } from "@/components/brand/PhoneKappyOrbit";
import { KappyOpportunitiesOrbit } from "@/components/brand/KappyOpportunitiesOrbit";
import { ONBOARDING } from "@/lib/brand";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
import KappyWaving from "@/assets/illustrations/KappyWaving.webp";

// KappyWaving/KappyPhone/KappyLookingUp are all the same 1024×922 source
// canvas (checked directly) — so every "slide 0/1/2" box below shares this
// exact aspect ratio instead of each guessing its own via independent
// vh/height caps. That's the actual fix for why Kappy used to vanish or get
// cropped to nothing on some screen sizes and not others: the box's *shape*
// used to be whatever px-6/max-h-[45vh]/flex-basis happened to produce at a
// given viewport, which had no relationship to the art's real proportions —
// at some sizes that shape was so far off-ratio that object-cover cropped
// straight through Kappy's whole body, and the child illustrations'
// percentage-based positioning (which assumes this same ratio) drifted
// along with it. Locking the box to the art's own ratio means it only ever
// scales uniformly — same composition, same relative positions, at every
// breakpoint — instead of reshaping.
//
// Three tiers, not two — the split-screen layout kicks in at `md` (768px),
// but the illustration column's actual *shape* at that width is nothing
// like it is at `lg`+: at md it's still a narrow, tall column (~250-380px
// wide against the full viewport height), and at lg it's a genuinely wide
// landscape-ish half. Sizing both the same way (e.g. "fill the full column
// height") stretched a distorted, tiny Kappy into a mostly-empty tall
// column at md — forcing height while also capping width doesn't reconcile
// through the aspect-ratio the way you'd want without also recomputing the
// *other* dimension, which plain width/height + aspect-ratio doesn't do on
// its own. Staying width-bound through md (same rule as mobile, just a
// larger cap) sidesteps that entirely; only lg+, where the column is
// genuinely wide enough for a tall box to make sense, switches to
// height-bound for the "large and immersive" look the split layout wants.
const KAPPY_BOX =
  "aspect-[1024/922] w-full max-w-[420px] md:max-w-[70%] lg:h-[90%] lg:w-auto lg:max-w-[92%] lg:max-h-none";

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
export function OnboardingCarousel() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Purely local, no backend — a returning visitor who's already seen this
  // carousel skips straight to /welcome instead of sitting through it
  // again every time they open the site. (The page itself is already
  // guest-gated server-side by this point — see app/page.tsx — this only
  // decides whether a *guest* sees the carousel or skips it.)
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
              <div className={`relative ${KAPPY_BOX}`}>
                <Image
                  src={KappyWaving}
                  alt="Kappy waving"
                  fill
                  priority
                  sizes="(min-width: 768px) 45vw, 95vw"
                  className="object-contain object-top"
                />
              </div>
            ) : index === 1 ? (
              <PhoneKappyOrbit className={KAPPY_BOX} />
            ) : (
              <KappyOpportunitiesOrbit className={KAPPY_BOX} />
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
                <h1 className="font-nunito text-xl font-extrabold text-ink sm:text-2xl md:text-3xl">
                  {slide.header}
                </h1>
                <p className="mx-auto max-w-sm font-nunito text-sm leading-relaxed text-muted md:mx-0 md:max-w-sm md:text-base">
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
