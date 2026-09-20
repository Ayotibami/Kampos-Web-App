"use client";

import { useEffect, useRef } from "react";
import { motion, useAnimationControls, type Transition } from "framer-motion";
import { Plus } from "@/components/ui/icons";

const REST = { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 };

/**
 * Five one-shot, four-second "come play with me" idle animations, cycled
 * in rotation (never twice in a row) every 30s for as long as this button
 * is mounted — see FeedContent's own doc on why forever, not just until
 * first tap. Each is a decaying, overshoot-and-settle keyframe sequence
 * (not a literal physics spring) so the total duration is exactly 4s and
 * predictable, while still reading as springy/playful rather than a flat
 * linear tween — the overshoot-then-settle shape IS what a spring looks
 * like, we're just authoring it by hand instead of simulating it.
 *
 * These animate the PLUS ICON, not the button itself — see the component
 * below for why. Amplitudes (the `y`/`x` hops especially) are tuned to the
 * icon's own small size (24px inside a 56px circle, ~16px of margin on
 * every side), not the whole button's — a hop that looked right on the
 * full 56px button would fly the icon well past the circle's edge here.
 */
const ANIMATIONS: Array<{ keyframes: Record<string, number[]>; transition: Transition }> = [
  {
    // Vertical hops with a squash/stretch on each landing, decaying.
    keyframes: {
      y: [0, -11, 0, -6, 0, -3, 0],
      scaleY: [1, 1, 0.85, 1, 0.92, 1, 1],
      scaleX: [1, 1, 1.1, 1, 1.05, 1, 1],
    },
    transition: { duration: 4, times: [0, 0.18, 0.36, 0.56, 0.72, 0.88, 1], ease: "easeOut" },
  },
  {
    // Pendulum rotate, decaying amplitude.
    keyframes: { rotate: [0, -20, 16, -12, 8, -4, 0] },
    transition: { duration: 4, times: [0, 0.15, 0.32, 0.5, 0.68, 0.85, 1], ease: "easeInOut" },
  },
  {
    // A full spin that overshoots slightly past 360 then eases back —
    // 380/360 both read as the same resting orientation, so it lands
    // visually exactly where it started.
    keyframes: { rotate: [0, 380, 360] },
    transition: { duration: 4, times: [0, 0.55, 1], ease: ["easeOut", "easeInOut"] },
  },
  {
    // A little arc hop to the side and back, like a curved leap.
    keyframes: {
      x: [0, -6, 7, -3, 0],
      y: [0, -13, -5, -2, 0],
      rotate: [0, -8, 6, -2, 0],
    },
    transition: { duration: 4, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeInOut" },
  },
  {
    // Jelly squash-and-stretch shimmy.
    keyframes: {
      scaleX: [1, 1.15, 0.9, 1.08, 0.96, 1],
      scaleY: [1, 0.88, 1.1, 0.94, 1.03, 1],
      rotate: [0, 4, -4, 2, -1, 0],
    },
    transition: { duration: 4, times: [0, 0.2, 0.4, 0.6, 0.8, 1], ease: "easeInOut" },
  },
];

/**
 * Mobile-only floating compose trigger — bottom-right FAB, replacing the
 * header's own "+" button on small screens (see FeedContent, which hides
 * that one via `hidden md:flex` and renders this one via `md:hidden`
 * instead; desktop keeps the header button, unanimated, exactly as it
 * always has). Runs forever, not just until first tap — a FAB sitting
 * quietly in the corner of a fast-scrolling feed is easy to forget is
 * there at all, unlike a one-time coach mark's job of teaching something
 * once, so this keeps nudging every 30s for as long as the feed is open,
 * tap or no tap.
 *
 * The animation lives on the PLUS ICON inside, not the outer button — the
 * button itself is the actual fixed-position tap target anchored to this
 * corner, and never moves or transforms at all (aside from the ordinary
 * whileTap press feedback, which is a direct response to a real tap, not
 * part of the unprompted idle cycle). That split is what lets the icon
 * have real hops/arcs/squash freely, the same richer motion a translating
 * button couldn't use without dragging the actual tap target out of place
 * with it — the circle stays put; only the glyph inside it plays.
 */
export function FloatingComposeButton({ onClick }: { onClick: () => void }) {
  const controls = useAnimationControls();
  const nextIndexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const playNext = async () => {
      const anim = ANIMATIONS[nextIndexRef.current % ANIMATIONS.length];
      nextIndexRef.current += 1;
      await controls.start({ ...anim.keyframes, transition: anim.transition });
      if (!cancelled) controls.set(REST);
    };
    const interval = setInterval(playNext, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [controls]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Create a gist"
      whileTap={{ scale: 0.88 }}
      // Bottom offset clears MobileTabBar, which now floats as a pill lifted
      // off the edge (not flush to it) — needs more clearance than a plain
      // safe-area inset alone to sit above the pill's own top edge.
      className="fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 transition hover:bg-brand-dark md:hidden"
    >
      <motion.span initial={REST} animate={controls} className="flex items-center justify-center">
        <Plus className="h-6 w-6" />
      </motion.span>
    </motion.button>
  );
}
