"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Lottie from "lottie-react";
import type { ReactionType } from "@/types";
import { compactNumber } from "@/lib/format";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";
import { ReactionIconFill } from "@/components/ui/icons";

const REACTIONS: ReactionType[] = ["LIKE", "LOVE", "FIRE", "SAD", "LAUGH"];
const HERO_SIZE = 34; // px — the center face, stays the visually dominant one
const SATELLITE_SIZE = 20; // px — matches the artifact mock exactly
const ORBIT_RADIUS = 17; // px from center — matches the artifact mock exactly

// Four evenly-spaced points on a circle around the hero — diagonal corners
// (45°/135°/225°/315°) rather than N/E/S/W, so nothing sits directly above
// (crowds the card content) or directly below (crowds the tray below it).
// Computed, not hand-picked per position, so the spacing stays genuinely
// equal if a 5th satellite ever needs to join.
function orbitPositions(count: number, startDeg = 45) {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => {
    const rad = ((startDeg + i * step) * Math.PI) / 180;
    return { x: Math.cos(rad) * ORBIT_RADIUS, y: Math.sin(rad) * ORBIT_RADIUS };
  });
}

interface MobileReactionBadgeProps {
  onReact: (type: ReactionType) => void;
  onUnreact?: () => void;
  counts?: Partial<Record<ReactionType, number>>;
  /** The viewer's existing reaction, straight from the gist payload — seeds
   * which emoji shows as the hero face on mount. */
  initialActive?: ReactionType | null;
  /** Lets double-tap-on-card-body (GistCard) select a reaction exactly as if
   * the tray's own row had been tapped — same bump/active/onReact, just
   * without opening the tray itself. Bump the nonce each time; a repeated
   * nonce is ignored. */
  externalTrigger?: { type: ReactionType; nonce: number } | null;
  /** Fires whenever a reaction is newly selected (not on un-react) — GistCard
   * uses this to show its big center-screen pop, same as the desktop row. */
  onReacted?: (type: ReactionType) => void;
  /** Runs before any tap is actually acted on — return false to block it
   * (e.g. "you need an account to react"). */
  guardClick?: () => boolean;
}

/**
 * Mobile's reaction display — arrangement #4, locked in: a hero icon at the
 * center (your own reaction, or a neutral glyph) with the other reactions
 * orbiting it, sized/spaced to match the artifact mock exactly. Tapping the
 * hero pops a vertical tray of all 5 reactions (each with its own live
 * count) up from the button; picking one bumps its count, plays a scale-pop
 * on the hero to show the new pick landing, and closes the tray. Tapping
 * your already-active reaction in the tray un-reacts, same as everywhere
 * else reactions work in this app.
 */
export function MobileReactionBadge({
  onReact,
  onUnreact,
  counts,
  initialActive,
  externalTrigger,
  onReacted,
  guardClick,
}: MobileReactionBadgeProps) {
  const [active, setActive] = useState<ReactionType | null>(initialActive ?? null);
  const [localDelta, setLocalDelta] = useState<Partial<Record<ReactionType, number>>>({});
  const [open, setOpen] = useState(false);
  const lastExternalNonce = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const countFor = (type: ReactionType): number =>
    Math.max(0, (counts?.[type] ?? 0) + (localDelta[type] ?? 0));
  const bump = (type: ReactionType, delta: number) =>
    setLocalDelta((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + delta }));

  const selectReaction = (type: ReactionType) => {
    if (active) bump(active, -1);
    bump(type, 1);
    setActive(type);
    onReact(type);
    onReacted?.(type);
  };

  const handlePick = (type: ReactionType) => {
    if (guardClick && !guardClick()) return;
    if (active === type) {
      bump(type, -1);
      setActive(null);
      if (onUnreact) onUnreact();
      else onReact(type);
    } else {
      selectReaction(type);
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!externalTrigger) return;
    if (externalTrigger.nonce === lastExternalNonce.current) return;
    lastExternalNonce.current = externalTrigger.nonce;
    if (guardClick && !guardClick()) return;
    if (active === externalTrigger.type) return; // already reacted this way — no-op
    // eslint-disable-next-line react-hooks/set-state-in-effect
    selectReaction(externalTrigger.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const rest = REACTIONS.filter((type) => type !== active);
  const positions = orbitPositions(rest.length);
  const span = ORBIT_RADIUS * 2 + SATELLITE_SIZE;

  return (
    <div ref={rootRef} className="relative">
      {/* Vertical tray — every reaction, each with its own live count
          underneath, rising from the hero button. Grows upward into open
          card space rather than sideways into the footer's stats row. */}
      <AnimatePresence>
        {open && (
          <div className="absolute bottom-full right-0 mb-2 flex flex-col items-center gap-2">
            {REACTIONS.map((type, i) => {
              const isActive = type === active;
              const count = countFor(type);
              return (
                <motion.button
                  key={type}
                  type="button"
                  onClick={() => handlePick(type)}
                  aria-label={type}
                  aria-pressed={isActive}
                  initial={{ opacity: 0, y: 8, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24, delay: i * 0.03 }}
                  className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-full bg-surface-2 shadow-lg shadow-black/15 ring-1 backdrop-blur-sm transition-transform active:scale-90 ${
                    isActive ? "ring-2 ring-brand" : "ring-line/60"
                  }`}
                >
                  {/* Only ever mounts while the tray is open — Modal-style
                      remount-on-open (see CommentSheet's own reasoning), so
                      autoplay alone is enough to have each one actually play
                      the moment it appears, no ref/goToAndPlay needed. Loops
                      the whole time the tray's up, unlike everywhere else
                      reactions animate once-on-action — here it's a picker,
                      not a response to an action yet, so it stays alive to
                      actually catch the eye while you're choosing. */}
                  <Lottie animationData={REACTION_ANIMATIONS[type]} loop autoplay className="h-5 w-5" />
                  {count > 0 && (
                    <span className="font-poppins text-[8px] font-semibold leading-none text-ink/70">
                      {compactNumber(count)}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <div className="relative" style={{ width: span, height: span }}>
        {rest.map((type, i) => (
          <div
            key={type}
            className="absolute flex items-center justify-center rounded-full bg-surface-2 shadow-sm shadow-black/10 ring-1 ring-line/60"
            style={{
              height: SATELLITE_SIZE,
              width: SATELLITE_SIZE,
              left: `calc(50% + ${positions[i].x}px)`,
              top: `calc(50% + ${positions[i].y}px)`,
              transform: "translate(-50%, -50%)",
              zIndex: 10,
            }}
          >
            <Lottie animationData={REACTION_ANIMATIONS[type]} loop={false} autoplay={false} className="h-4 w-4" />
          </div>
        ))}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="React to this gist"
          aria-expanded={open}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface-2 shadow-md shadow-black/15 ring-2 ring-brand/40 transition-transform active:scale-95"
          style={{ height: HERO_SIZE, width: HERO_SIZE, zIndex: 20 }}
        >
          {/* Keyed by `active` so picking a new reaction (tray or
              double-tap) retriggers this pop/scale-in instead of just
              silently swapping the icon. */}
          <motion.span
            key={active ?? "none"}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="flex items-center justify-center"
          >
            {active ? (
              <Lottie animationData={REACTION_ANIMATIONS[active]} loop={false} autoplay={false} className="h-5 w-5" />
            ) : (
              <ReactionIconFill className="h-4 w-4 text-faint" weight="regular" />
            )}
          </motion.span>
        </button>
      </div>
    </div>
  );
}
