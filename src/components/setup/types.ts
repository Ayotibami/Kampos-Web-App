/**
 * What an individual step reports up to the single-page orchestrator so it
 * can drive the one shared StepScaffold (Continue button state/handler,
 * loading) — heading/subheading are static per step and live in the
 * orchestrator's own STEP_CONFIG instead, since they don't depend on any
 * step's internal state the way continueDisabled/onContinue do.
 */
export interface StepController {
  continueDisabled: boolean;
  onContinue: () => void | Promise<void>;
  loading?: boolean;
}

export interface StepProps {
  /** Advance to the next step (or, on the last step, complete the flow). */
  onNext: () => void;
  /** Report this step's current continue-button state/handler up to the
   * orchestrator — called whenever anything relevant changes (typically in
   * a `useEffect` keyed on the step's own local validation state). */
  setController: (controller: StepController) => void;
}
