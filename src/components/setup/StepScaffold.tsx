"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls, type Variants } from "framer-motion";
import { ArrowLeft } from "@/components/ui/icons";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/onboarding/ProgressDots";

export const SETUP_STEPS = 5;

// Fast slide/fade for the swapped step content — nothing flies across the
// screen as a boxed card anymore (see the full-page rewrite below); the
// heading swings with it since both live inside the same animated block.
const contentVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction >= 0 ? -40 : 40 }),
};
const contentTransition = { duration: 0.28, ease: "easeOut" } as const;

/**
 * The Continue/CTA button — pops with a one-shot bounce the instant it
 * flips from disabled to enabled, so a user who's just finished typing
 * (e.g. the Avitag check landing on "available") actually notices it
 * became clickable, instead of a plain color change that's easy to miss.
 * Only fires on that specific transition, not on every render/re-enable-
 * disable flicker, and never loops — a continuous bounce reads as nagging.
 */
function ContinueButton({
  onContinue,
  continueDisabled,
  loading,
  continueLabel,
  className,
}: {
  onContinue: () => void;
  continueDisabled?: boolean;
  loading?: boolean;
  continueLabel: string;
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
    <motion.div animate={controls} transition={{ duration: 0.4, ease: "easeOut" }} className={className}>
      <Button onClick={onContinue} disabled={continueDisabled || loading} loading={loading}>
        {continueLabel}
      </Button>
    </motion.div>
  );
}

/**
 * Shared frame for the whole profile-setup wizard — rendered once by the
 * orchestrator page (app/setup-profile/page.tsx), not per-step, so the
 * backdrop/wordmark/chrome never remount between steps; only the content
 * (keyed by `stepIndex`) slides/fades.
 *
 * No card, and — unlike AuthShell — no page scrolling either: the heading
 * is pinned to the top of the viewport, the progress dots + Continue button
 * are pinned to the bottom, and the actual step content fills the entire
 * flexible strip in between (`h-dvh` + `overflow-hidden` on the root, so
 * this is guaranteed by construction, not by hoping content happens to
 * fit). List-heavy steps (major/campus search) get the whole middle strip,
 * full height, and scroll internally via their own search-bar-stays-put
 * layout (SearchSelectList) rather than the page scrolling.
 *
 * Traded away from the earlier boxed-card version: the whole-card-flies-
 * off-screen bounce — a real, deliberate loss, not an oversight — in
 * exchange for guaranteed no-scroll, full-height steps.
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
   * the slide goes. */
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

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-surface">
      {/* Subtle backdrop, same restrained treatment as
          AuthShell — a bit of visual life without competing with the
          form/list content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-brand/[0.04] dark:bg-brand/[0.06]"
      >
        <div
          className="absolute inset-0 opacity-90 dark:opacity-80 dark:invert"
          style={{
            backgroundImage: "url('/brand/doodles.svg')",
            backgroundRepeat: "repeat",
            backgroundSize: "280px auto",
          }}
        />
      </div>

      <div className="absolute left-8 top-8 z-10 hidden md:block">
        <Wordmark accentClassName="text-brand" className="text-lg" />
      </div>

      {/* Top bar — pinned, never moves. Back button + heading live here
          (not inside the swapped content) on desktop, where there's room
          for both a corner wordmark and a top bar without collision; on
          mobile the heading moves down into the swapped content itself
          (see below) since there isn't room for two separate header rows. */}
      <div className="relative z-10 mx-auto hidden w-full max-w-3xl shrink-0 items-center gap-3 px-10 pt-8 md:flex">
        {backButton}
        <h1 className="font-nunito text-lg font-semibold text-ink">{heading}</h1>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-3 px-6 pt-6 md:hidden">
        {backButton}
      </div>

      {/* The flexible middle strip — this is the entire guarantee: fixed
          top/bottom bars + min-h-0 flex-1 here means whatever's left is
          exactly what the step content gets, full height, no viewport
          scroll no matter how tall a list gets (it scrolls internally via
          its own layout instead). */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6 md:px-10">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={stepIndex}
            custom={direction}
            variants={contentVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={contentTransition}
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="shrink-0 space-y-1.5 pt-4 md:pt-6">
              <h1 className="font-nunito text-xl font-extrabold text-ink sm:text-2xl md:hidden">
                {heading}
              </h1>
              {subheading && (
                <p className="font-nunito text-sm text-muted md:text-base">{subheading}</p>
              )}
            </header>

            <div className="mt-5 flex min-h-0 flex-1 flex-col pb-4 md:mt-6">{children}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom bar — pinned, never moves. */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-4 px-6 pb-6 pt-2 md:flex-row md:items-center md:justify-between md:px-10 md:pb-10">
        <ProgressDots count={SETUP_STEPS} index={stepIndex} />
        <ContinueButton
          onContinue={onContinue}
          continueDisabled={continueDisabled}
          loading={loading}
          continueLabel={continueLabel}
          className="md:w-64"
        />
      </div>
    </div>
  );
}
