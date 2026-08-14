"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Uniform pill styling for all three (campus, major, level) — same shape,
// background, and color. Hierarchy comes only from font size and weight,
// stepping down from campus (largest/boldest) to level (smallest/lightest).
//
// Each tag also gets a subtle side-to-side sway every few seconds, staggered
// slightly (campus first, then major, then level) so the three ripple like a
// little dance instead of blinking in unison. GistCard-only — the profile
// page's header uses its own simpler, unanimated ProfileTags instead (see
// ProfileView.tsx), not these.
const TAG_BASE =
  "inline-block rounded-full bg-brand/10 px-2 py-0.5 font-nunito uppercase tracking-wide text-brand";

const TAG_DANCE = {
  animate: { x: [0, -3, 3, 0], rotate: [0, -3, 3, 0] },
  transition: { duration: 0.6, repeat: Infinity, repeatDelay: 3.4, ease: "easeInOut" as const },
};

export function CampusTag({ children }: { children: ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0 }}
      className={`${TAG_BASE} text-[9px] font-bold md:text-[10px]`}
    >
      {children}
    </motion.span>
  );
}

export function MajorTag({ children }: { children: ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0.15 }}
      className={`${TAG_BASE} text-[8px] font-semibold md:text-[9px]`}
    >
      {children}
    </motion.span>
  );
}

export function LevelTag({ children }: { children: ReactNode }) {
  return (
    <motion.span
      {...TAG_DANCE}
      transition={{ ...TAG_DANCE.transition, delay: 0.3 }}
      className={`${TAG_BASE} text-[7px] font-medium md:text-[8px]`}
    >
      {children}
    </motion.span>
  );
}
