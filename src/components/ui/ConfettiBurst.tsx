"use client";

/**
 * A single one-shot confetti burst — same technique WelcomeSheet's own
 * setup-complete celebration already uses (small colored dots flung
 * outward and fading), pulled out into its own reusable piece since the
 * Baiday Wishes picker needed the same quiet celebratory moment.
 *
 * Plays once from mount. The caller remounts it (via a changing `key`,
 * e.g. keyed to the picked date) whenever the moment that deserves it
 * happens again — this component has no internal replay/loop logic.
 */

import { motion } from "framer-motion";

const PARTICLES = [
  { color: "var(--color-brand)", tx: -26, ty: -22, rot: 140, delay: 0.02 },
  { color: "var(--color-warning)", tx: 24, ty: -24, rot: -120, delay: 0.06 },
  { color: "var(--color-success)", tx: -30, ty: -6, rot: 200, delay: 0 },
  { color: "var(--color-brand-accent)", tx: 28, ty: -4, rot: -80, delay: 0.09 },
  { color: "var(--color-warning)", tx: -14, ty: -32, rot: 60, delay: 0.07 },
  { color: "var(--color-brand)", tx: 14, ty: -34, rot: -160, delay: 0.04 },
  { color: "var(--color-success)", tx: 0, ty: -36, rot: 100, delay: 0.1 },
  { color: "var(--color-warning)", tx: -36, ty: -14, rot: -40, delay: 0.12 },
] as const;

export function ConfettiBurst({ size = 5 }: { size?: number }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-[1.5px]"
          style={{ width: size, height: size, backgroundColor: p.color }}
          initial={{ opacity: 1, x: "-50%", y: "-50%", scale: 0.6, rotate: 0 }}
          animate={{
            opacity: 0,
            x: `calc(-50% + ${p.tx}px)`,
            y: `calc(-50% + ${p.ty}px)`,
            scale: 1,
            rotate: p.rot,
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </span>
  );
}
