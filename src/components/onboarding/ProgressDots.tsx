"use client";

import { motion } from "framer-motion";

/** FancyScroll (web) — animated progress dots; the active one stretches into a pill. */
export function ProgressDots({
  count,
  index,
  inactiveColor = "var(--color-line)",
  onDotClick,
}: {
  count: number;
  index: number;
  /** Color for the non-active dots — defaults to the hairline gray meant
   * for a white card background. Override on a tinted/colored backdrop
   * (e.g. the desktop setup-step footer sitting on the brand-tint doodle
   * background) where that gray would otherwise blend in. */
  inactiveColor?: string;
  /** Makes each dot clickable, jumping straight to that slide/step — e.g.
   * the onboarding carousel, where skipping around is harmless. Omit for a
   * purely decorative indicator (e.g. a wizard where steps must be
   * completed in order and clicking ahead wouldn't be valid). */
  onDotClick?: (index: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: count }).map((_, i) => {
        const active = i === index;
        return (
          <motion.button
            key={i}
            type="button"
            onClick={onDotClick ? () => onDotClick(i) : undefined}
            aria-label={onDotClick ? `Go to slide ${i + 1}` : undefined}
            animate={{
              width: active ? 24 : 8,
              backgroundColor: active ? "var(--color-brand)" : inactiveColor,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`h-2 rounded-full ${onDotClick ? "cursor-pointer" : ""}`}
          />
        );
      })}
    </div>
  );
}
