"use client";

/**
 * The full festive treatment for a profile on its owner's actual birthday
 * (see ProfileView.tsx's own isBirthdayToday check — month/day only, no
 * year, same convention as everywhere else birthdays show up in this app).
 * Shows for ANYONE viewing the profile that day, not just the owner — a
 * public festive state, same as how other apps surface a birthday cake
 * next to someone's name.
 *
 * Three pieces, each with its own restraint:
 *  - A one-shot confetti rain across the top of the viewport on mount —
 *    the "ta-da" moment, not an endless loop (that would get obnoxious
 *    and chew battery for anyone leaving the tab open all day).
 *  - A handful of balloons gently drifting for as long as the page is
 *    open — continuous, but slow and subtle, never competing with the
 *    actual content for attention.
 *  - A small crown badge on the avatar, static — meant to read at a
 *    glance, not animate.
 * All of it skips straight to its resting state under
 * prefers-reduced-motion, same as the rest of this app already does.
 */

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const CONFETTI_COLORS = [
  "var(--color-brand)",
  "var(--color-warning)",
  "var(--color-success)",
  "var(--color-brand-accent)",
  "#ff6f91",
];

interface ConfettiPiece {
  id: number;
  left: number; // vw
  delay: number;
  duration: number;
  rotate: number;
  color: string;
  size: number;
}

function buildConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.3,
    rotate: (Math.random() - 0.5) * 720,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 5,
  }));
}

// Spread across the whole viewport — up/down as well as left/right, not
// just one row along the top — so the page reads as surrounded rather
// than having a single balloon strip.
const BALLOONS = [
  { left: "4%", top: "8%", size: 34, delay: 0, duration: 5.5 },
  { left: "88%", top: "6%", size: 28, delay: 0.8, duration: 6.2 },
  { left: "14%", top: "18%", size: 22, delay: 1.6, duration: 5.8 },
  { left: "78%", top: "16%", size: 36, delay: 0.4, duration: 6.6 },
  { left: "2%", top: "34%", size: 26, delay: 1.1, duration: 6.0 },
  { left: "93%", top: "30%", size: 24, delay: 1.9, duration: 5.4 },
  { left: "22%", top: "4%", size: 20, delay: 0.6, duration: 6.4 },
  { left: "66%", top: "40%", size: 30, delay: 2.2, duration: 5.9 },
  { left: "8%", top: "52%", size: 28, delay: 1.3, duration: 6.1 },
  { left: "90%", top: "50%", size: 22, delay: 0.2, duration: 5.6 },
  { left: "40%", top: "6%", size: 24, delay: 1.7, duration: 6.3 },
  { left: "34%", top: "60%", size: 20, delay: 2.0, duration: 5.7 },
  { left: "72%", top: "64%", size: 26, delay: 0.9, duration: 6.5 },
  { left: "50%", top: "70%", size: 22, delay: 1.4, duration: 5.3 },
] as const;

export function BirthdayCelebration() {
  const reducedMotion = useReducedMotion();
  // Built once on mount (not in render) so a re-render mid-animation never
  // regenerates a fresh random batch out from under the pieces already
  // falling — same "frozen at mount" reasoning WelcomeSheet's own CONFETTI
  // constant gets simply by being a module-level array; this one needs
  // real randomness per visit instead, so it has to live in state.
  const [confetti] = useState(() => (reducedMotion ? [] : buildConfetti(28)));

  return (
    <>
      {/* Confetti rain — fixed to the viewport (not the page), so it reads
          as "the whole screen is celebrating" rather than being clipped to
          wherever the header happens to scroll. pointer-events-none the
          whole way down; nothing here should ever intercept a tap. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-full overflow-hidden" aria-hidden="true">
        {confetti.map((c) => (
          <motion.span
            key={c.id}
            className="absolute top-0 rounded-[2px]"
            style={{ left: `${c.left}vw`, width: c.size, height: c.size * 0.4, backgroundColor: c.color }}
            initial={{ y: -40, opacity: 1, rotate: 0 }}
            animate={{ y: "110vh", opacity: [1, 1, 0], rotate: c.rotate }}
            transition={{ duration: c.duration, delay: c.delay, ease: "easeIn" }}
          />
        ))}
      </div>

      {/* Balloons — gently bobbing, for as long as the page stays open.
          Skips straight to a still frame under reduced motion rather than
          just slowing down, same as the confetti skipping entirely. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-full overflow-hidden" aria-hidden="true">
        {BALLOONS.map((b, i) => (
          <motion.span
            key={i}
            className="absolute select-none"
            style={{ left: b.left, top: b.top, fontSize: b.size }}
            initial={{ y: 0, rotate: -4 }}
            animate={
              reducedMotion
                ? { y: 0, rotate: -4 }
                : { y: [0, -18, 0], rotate: [-4, 4, -4] }
            }
            transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            🎈
          </motion.span>
        ))}
      </div>
    </>
  );
}

/** Small crown badge for the avatar — a sibling positioned absolutely by
 * the caller (see ProfileView.tsx), not animated, just a clear at-a-glance
 * "it's their day" marker sitting right where the eye already lands. */
export function BirthdayCrown({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] ${className}`}
    >
      👑
    </span>
  );
}

const SPARKLES = [
  { left: "6%", top: "10%", delay: 0.2, size: 22 },
  { left: "90%", top: "14%", delay: 0.8, size: 18 },
  { left: "14%", top: "70%", delay: 1.3, size: 16 },
  { left: "86%", top: "66%", delay: 0.5, size: 20 },
] as const;

/** Big, continuously-animated centerpiece — meant to be the one genuinely
 * dramatic moment on the page (see ProfileView.tsx, placed right above the
 * bio card). Unlike the confetti rain (one-shot) and balloons (gentle,
 * quiet drift), this one keeps performing for as long as someone's looking
 * at it — a bounce-and-wobble loop plus a slow glow pulse behind it, with
 * a few sparkles twinkling around it for extra flourish. Collapses to a
 * still frame under reduced motion, same as the rest of this component. */
export function BirthdayCake() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center py-4 md:py-8" aria-hidden="true">
      {/* Soft radial glow pulsing behind the cake — gives it some weight/
          drama without needing more moving parts. */}
      <motion.div
        className="absolute h-40 w-40 rounded-full blur-2xl md:h-56 md:w-56"
        style={{ background: "radial-gradient(circle, var(--color-warning) 0%, transparent 70%)" }}
        initial={{ opacity: 0.25, scale: 0.9 }}
        animate={reducedMotion ? { opacity: 0.25, scale: 0.9 } : { opacity: [0.2, 0.45, 0.2], scale: [0.9, 1.08, 0.9] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {SPARKLES.map((s, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute select-none"
          style={{ left: s.left, top: s.top, fontSize: s.size }}
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={
            reducedMotion
              ? { opacity: 0.8, scale: 1 }
              : { opacity: [0, 1, 0], scale: [0.6, 1.1, 0.6], rotate: [0, 25, 0] }
          }
          transition={{ duration: 1.8, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          ✨
        </motion.span>
      ))}

      <motion.span
        className="relative select-none text-[140px] leading-none drop-shadow-[0_14px_24px_rgba(0,0,0,0.3)] md:text-[220px]"
        style={{ transformOrigin: "50% 85%" }}
        initial={{ y: 0, rotate: 0, scale: 1 }}
        animate={
          reducedMotion
            ? { y: 0, rotate: 0, scale: 1 }
            : { y: [0, -16, 0, -6, 0], rotate: [-6, 6, -4, 4, -6], scale: [1, 1.05, 1, 1.03, 1] }
        }
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        🎂
      </motion.span>
    </div>
  );
}
