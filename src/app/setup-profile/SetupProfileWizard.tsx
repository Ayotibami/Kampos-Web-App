"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StepScaffold } from "@/components/setup/StepScaffold";
import { NameStep } from "@/components/setup/steps/NameStep";
import { SchoolStep } from "@/components/setup/steps/SchoolStep";
import { AcademicsStep } from "@/components/setup/steps/AcademicsStep";
import { ProfileStep } from "@/components/setup/steps/ProfileStep";
import { AvitagStep } from "@/components/setup/steps/AvitagStep";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import type { StepController } from "@/components/setup/types";

// Static per-step chrome — only the parts that don't depend on any step's
// own internal state (continueDisabled/onContinue/loading come from each
// step's registered controller instead, since those genuinely do).
const STEP_CONFIG: {
  heading: string;
  subheading?: string;
  continueLabel?: string;
}[] = [
  {
    heading: "Enter Your Name, Make We Dey Familiar!",
    subheading: "Type in your first and last name.",
  },
  {
    heading: "Which campus you dey rep?",
    subheading: "Select your school from the list or search for it.",
  },
  {
    heading: "We need more of your Academic info",
    subheading: "Select your Major and level of study.",
  },

  {
    heading: "Make your profile set well, for better experience.",
    subheading:
      "Add a profile picture and bio — totally optional, but it helps other students know you.",
  },
  {
    heading: "You go need an Avitag!",
    subheading:
      "Your Avitag is your unique Kampos username — 4–15 characters, letters, numbers, and underscores only, with at least one letter.",
    continueLabel: "Create Profile",
  },
];

const NOOP_CONTROLLER: StepController = {
  continueDisabled: true,
  onContinue: () => {},
};

/**
 * One page for the whole profile-setup wizard — AppShell/StepScaffold are
 * mounted exactly once here, so its backdrop/wordmark never remount between
 * steps; only the content (keyed by step index, inside StepScaffold) swings
 * left/right as `currentStep` changes. `currentStep` itself lives in
 * setupProfileStore and is persisted, so returning later resumes here
 * instead of restarting from step 0.
 */
export function SetupProfileWizard() {
  const currentStep = useSetupProfileStore((s) => s.currentStep);
  const setStep = useSetupProfileStore((s) => s.setStep);
  const hasHydrated = useSetupProfileStore((s) => s.hasHydrated);
  const [direction, setDirection] = useState(1);
  const [controller, setControllerState] =
    useState<StepController>(NOOP_CONTROLLER);

  // Clamp once the persisted step has actually loaded — a stored index
  // could in theory be out of range if STEP_CONFIG's length ever changes
  // between sessions. Gated on hasHydrated so this doesn't fire against the
  // default (unhydrated) currentStep=0 first and clobber nothing.
  useEffect(() => {
    if (!hasHydrated) return;
    if (currentStep > STEP_CONFIG.length - 1) setStep(STEP_CONFIG.length - 1);
    else if (currentStep < 0) setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  // localStorage isn't available during SSR, so `currentStep` starts at its
  // default (0) on the very first render regardless of what was actually
  // saved — rendering real step content before hydration finishes would
  // flash step 0 and then jump to wherever the visitor actually left off.
  // This fallback is intentionally minimal so it matches what the server
  // rendered (no hydration-mismatch warning) and swaps out the instant
  // rehydration completes, which is normally imperceptibly fast.
  if (!hasHydrated) {
    return (
      <AppShell variant="landscape">
        <div className="flex flex-1 items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        </div>
      </AppShell>
    );
  }

  // Each step reports its own continue-button state/handler here whenever
  // it changes (see components/setup/types.ts) — this is what lets one
  // shared StepScaffold instance drive five completely different steps'
  // worth of validation/submit logic without prop-drilling every field.
  const setController = (next: StepController) => setControllerState(next);

  // Reset to disabled immediately on any step change — the new step's own
  // registration effect corrects this a moment later, but this closes the
  // brief window where the *previous* step's onContinue would otherwise
  // still be wired up against the new step's content.
  const goNext = () => {
    setDirection(1);
    setControllerState(NOOP_CONTROLLER);
    setStep(Math.min(currentStep + 1, STEP_CONFIG.length - 1));
  };
  const goBack = () => {
    setDirection(-1);
    setControllerState(NOOP_CONTROLLER);
    setStep(Math.max(currentStep - 1, 0));
  };

  const config = STEP_CONFIG[currentStep];

  return (
    <StepScaffold
      stepIndex={currentStep}
      direction={direction}
      heading={config.heading}
      subheading={config.subheading}
      continueLabel={config.continueLabel}
      onBack={goBack}
      onContinue={controller.onContinue}
      continueDisabled={controller.continueDisabled}
      loading={controller.loading}
    >
      {currentStep === 0 && (
        <NameStep onNext={goNext} setController={setController} />
      )}
      {currentStep === 1 && (
        <SchoolStep onNext={goNext} setController={setController} />
      )}
      {currentStep === 2 && (
        <AcademicsStep onNext={goNext} setController={setController} />
      )}
      {currentStep === 3 && (
        <ProfileStep onNext={goNext} setController={setController} />
      )}
      {currentStep === 4 && <AvitagStep setController={setController} />}
    </StepScaffold>
  );
}
