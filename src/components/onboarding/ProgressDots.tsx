"use client";

import { motion } from "framer-motion";

/** FancyScroll (web) — animated progress dots; the active one stretches into a pill. */
export function ProgressDots({
  count,
  index,
  inactiveColor = "var(--color-line)",
}: {
  count: number;
  index: number;
  /** Color for the non-active dots — defaults to the hairline gray meant
   * for a white card background. Override on a tinted/colored backdrop
   * (e.g. the desktop setup-step footer sitting on the brand-tint doodle
   * background) where that gray would otherwise blend in. */
  inactiveColor?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: count }).map((_, i) => {
        const active = i === index;
        return (
          <motion.span
            key={i}
            animate={{
              width: active ? 24 : 8,
              backgroundColor: active ? "var(--color-brand)" : inactiveColor,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="h-2 rounded-full"
          />
        );
      })}
    </div>
  );
}
