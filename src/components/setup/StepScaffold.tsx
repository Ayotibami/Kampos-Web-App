"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls, type Variants } from "framer-motion";
import { ArrowLeft } from "@/components/ui/icons";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";

export const SETUP_STEPS = 5;

// A real dramatic swing — full off-card x-travel, a hard rotation, and a
// scale punch, spring-timed so it overshoots and snaps into place rather
// than a flat linear move. This is the WHOLE card (bg + rounded corners +
// shadow all live on the same element being animated — see the motion.div
// below), not just the text inside a static frame, so the card itself
// visibly flies off and the next one flies in. Direction-aware: 1 =
// advancing (new card flies in from the right, old flies out left), -1 =
// going back (reversed).
const cardVariants: Variants = {
  enter: (direction: number) => ({
    x: direction >= 0 ? "115%" : "-115%",
    rotate: direction >= 0 ? 18 : -18,
    scale: 0.82,
    opacity: 0,
  }),
  center: { x: 0, rotate: 0, scale: 1, opacity: 1 },
  exit: (direction: number) => ({
    x: direction >= 0 ? "-115%" : "115%",
    rotate: direction >= 0 ? -18 : 18,
    scale: 0.82,
    opacity: 0,
  }),
};
const cardTransition = { type: "spring", stiffness: 300, damping: 22, mass: 0.9 } as const;
// Lighter/faster version for the desktop heading (outside the card, its own
// small AnimatePresence) — swings the same direction but shouldn't compete
// with the card for attention.
const headingVariants: Variants = {
  enter: (direction: number) => ({ x: direction >= 0 ? "60%" : "-60%", rotate: direction >= 0 ? 10 : -10, opacity: 0 }),
  center: { x: 0, rotate: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction >= 0 ? "-60%" : "60%", rotate: direction >= 0 ? -10 : 10, opacity: 0 }),
};
const headingTransition = { type: "spring", stiffness: 340, damping: 28 } as const;

/**
 * The Continue/CTA button, shared by the desktop footer and the mobile
 * in-card row — pops with a one-shot bounce the instant it flips from
 * disabled to enabled, so a user who's just finished typing (e.g. the
 * Avitag check landing on "available") actually notices it became
 * clickable, instead of a plain color change that's easy to miss. Only
 * fires on that specific transition, not on every render/re-enable-disable
 * flicker, and never loops — a continuous bounce reads as nagging.
 */
function ContinueButton({
  onContinue,
  continueDisabled,
  loading,
  continueLabel,
  fullWidth,
  className,
}: {
  onContinue: () => void;
  continueDisabled?: boolean;
  loading?: boolean;
  continueLabel: string;
  fullWidth?: boolean;
  className?: string;
}) {
  const controls = useAnimationControls();
  const wasDisabled = useRef(continueDisabled);
  useEffect(() => {
    if (wasDisabled.current && !continueDisabled && !loading) {
      void controls.start({ scale: [1, 1.12, 0.96, 1] });
    }
    wasDisabled.current = continueDisabled;
  }, [continueDisabled, loading, controls]);

  return (
    <motion.div animate={controls} transition={{ duration: 0.4, ease: "easeOut" }}>
      <Button
        onClick={onContinue}
        disabled={continueDisabled || loading}
        loading={loading}
        fullWidth={fullWidth}
        className={className}
      >
        {continueLabel}
      </Button>
    </motion.div>
  );
}

/**
 * Single shared frame for the whole profile-setup wizard — rendered once by
 * the orchestrator page (app/setup-profile/page.tsx), not per-step, so
 * AppShell's backdrop/wordmark never remount between steps; only the
 * content keyed by `stepIndex` swings. `onBack`/`onContinue` are supplied
 * by the orchestrator (back = step index - 1; continue = whatever the
 * active step's own registered controller says).
 */
export function StepScaffold({
  stepIndex,
  direction,
  heading,
  subheading,
  children,
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
  loading,
}: {
  stepIndex: number;
  /** 1 = moving forward (Continue), -1 = moving back — controls which way
   * the swing goes. */
  direction: number;
  heading: string;
  subheading?: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  loading?: boolean;
}) {
  // Shared by both the desktop header and the mobile in-card row. Mobile
  // also gets a swipe-right drag gesture as a second way back (see the
  // card's drag props below) — the icon stays too since a gesture alone
  // isn't discoverable.
  const backButton = stepIndex > 0 && onBack && (
    <button
      type="button"
      onClick={onBack}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  // Desktop-only: heading lives above the (now short) card as page-level
  // chrome rather than eating into the card's own limited height. Static
  // back button + dots + CTA (outside the swing) so navigation controls
  // never visually move out from under a click — only the actual step
  // content (heading text included) swings.
  const desktopHeader = (
    <div className="flex items-center gap-3 px-1">
      {backButton}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.h1
            key={stepIndex}
            custom={direction}
            variants={headingVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={headingTransition}
            className="font-poppins text-lg font-semibold text-ink"
          >
            {heading}
          </motion.h1>
        </AnimatePresence>
      </div>
    </div>
  );

  const desktopFooter = (
    <div className="flex items-center justify-between gap-6 px-1">
      <ProgressDots count={SETUP_STEPS} index={stepIndex} inactiveColor="#ffffff" />
      <ContinueButton
        onContinue={onContinue}
        continueDisabled={continueDisabled}
        loading={loading}
        continueLabel={continueLabel}
        fullWidth={false}
        className="w-64"
      />
    </div>
  );

  return (
    <AppShell variant="landscape" chromeless outerHeader={desktopHeader} outerFooter={desktopFooter}>
      {/* The reserve slot: sizes/positions where the card lives, but carries
          no chrome of its own — clipped on mobile (so a dramatic swing can't
          visually collide with surrounding UI), open on desktop (so the card
          can fly genuinely off its own footprint against the backdrop). */}
      <div className="relative min-h-0 flex-1 overflow-hidden md:overflow-visible">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {/* This IS the card — bg, rounded corners, and shadow all live
              here, keyed by stepIndex, so the whole visible card actually
              flies with the transition instead of just the text inside a
              static frame. */}
          <motion.div
            key={stepIndex}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={cardTransition}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            onDragEnd={(_e, info) => {
              if (info.offset.x > 90 && stepIndex > 0 && onBack) onBack();
              else if (info.offset.x < -90 && !continueDisabled && !loading) onContinue();
            }}
            className="flex h-full min-h-0 flex-col bg-surface px-6 py-8 md:rounded-[32px] md:px-8 md:py-5 md:shadow-[0_30px_80px_-24px_rgba(9,30,66,0.6)] md:ring-1 md:ring-black/5 md:overflow-hidden"
          >
            <div className="flex items-center gap-3 md:hidden">{backButton}</div>

            {/* Heading text AND the step's own content share one width here —
                on desktop that's the whole point: without this, the subheading
                stretches the full (now very wide) card while the content below
                it stays narrower, and the mismatch is what actually looked
                wrong, not the content's width by itself.
                min-h-0 at every flex-1 level here (not just the innermost
                scrollable list) — without it each wrapper grows to fit its
                content instead of shrinking to the card's fixed height, so a
                long list gets silently clipped by the panel's overflow-hidden
                instead of becoming scrollable. */}
            <div className="flex min-h-0 flex-1 flex-col md:mx-auto md:w-full md:max-w-2xl">
              <header className="mt-2 shrink-0 space-y-2 md:mt-0">
                <h1 className="font-poppins text-xl font-extrabold text-ink sm:text-2xl md:hidden">
                  {heading}
                </h1>
                {subheading && (
                  <p className="font-poppins text-sm text-muted">{subheading}</p>
                )}
              </header>

              <div className="flex min-h-0 flex-1 flex-col py-6 md:py-3">{children}</div>
            </div>

            <div className="mt-auto space-y-5 md:hidden">
              <ProgressDots count={SETUP_STEPS} index={stepIndex} />
              <ContinueButton
                onContinue={onContinue}
                continueDisabled={continueDisabled}
                loading={loading}
                continueLabel={continueLabel}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
