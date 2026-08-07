"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import type { ReactionType } from "@/types";
import { compactNumber } from "@/lib/format";
import { REACTION_ANIMATIONS } from "@/lib/reactionAnimations";

const REACTIONS: { type: ReactionType; animationData: object }[] = (
  ["LIKE", "LOVE", "FIRE", "SAD", "LAUGH"] as ReactionType[]
).map((type) => ({ type, animationData: REACTION_ANIMATIONS[type] }));

interface ReactionButtonProps {
  onReact: (type: ReactionType) => void;
  /** Fires when the already-active reaction is tapped again (deselect).
   * Optional — omit to leave un-reacting purely local/UI-only (e.g. bars
   * that don't own a real gist id). */
  onUnreact?: () => void;
  /** Per-emoji counts, e.g. { FIRE: 1200, LOVE: 56000 }. Zero/missing shows no count. */
  counts?: Partial<Record<ReactionType, number>>;
  /** The viewer's existing reaction, straight from the gist payload
   * (`gist.my_reaction`) — seeds which emoji shows as already-selected on
   * mount, instead of every card always starting blank regardless of
   * whether you'd already reacted before reloading. */
  initialActive?: ReactionType | null;
  /** Lets something outside this row (e.g. double-tap-to-react on the card
   * body) select a reaction exactly as if its button had been clicked —
   * same count bump, same active-pill highlight, same onReact call — just
   * without that click's own row-anchored flying burst (the caller shows
   * its own bigger, differently-anchored burst instead). Bump the `nonce`
   * (e.g. Date.now()) alongside `type` each time; a repeated nonce is
   * ignored, so this is safe to pass the same object shape repeatedly. */
  externalTrigger?: { type: ReactionType; nonce: number } | null;
  /** Fires whenever a reaction is newly selected (not on deselect) — from
   * either a row click or an external trigger. The caller (GistCard) uses
   * this to show its own big center-screen pop, same animation and
   * placement as the double-tap-to-react burst, for whichever emoji was
   * actually picked. This component no longer renders its own burst. */
  onReacted?: (type: ReactionType) => void;
  /** Runs before any click/external-trigger is actually acted on — return
   * false to block it entirely (e.g. "you need an account to react"). Has
   * to gate *before* any local state changes, not just before the
   * `onReact` callback — this component updates its own active-pill/count
   * state optimistically, so gating any later than this would still flash
   * a reaction that never actually happened for whoever got blocked. */
  guardClick?: () => boolean;
}

/**
 * Emoji reaction row — one reaction active at a time per gist (matches the
 * backend: reactions are add/change/remove, never multiple at once). Icons
 * are genuinely animated (Lottie), playing once on hover/click rather than
 * looping constantly — keeps the resting row calm and makes the motion feel
 * like a response to your action, not background noise.
 */
export function ReactionButton({
  onReact,
  onUnreact,
  counts,
  initialActive,
  externalTrigger,
  onReacted,
  guardClick,
}: ReactionButtonProps) {
  const [active, setActive] = useState<ReactionType | null>(initialActive ?? null);
  const lastExternalNonce = useRef<number | null>(null);
  const [localDelta, setLocalDelta] = useState<Partial<Record<ReactionType, number>>>({});

  // lottieRef must be a real ref object (the library assigns to `.current`
  // directly) — REACTIONS is a fixed 5-item list, so five named refs, one per
  // type, keeps this within the rules of hooks while still being addressable
  // by ReactionType.
  const likeRef = useRef<LottieRefCurrentProps>(null);
  const loveRef = useRef<LottieRefCurrentProps>(null);
  const fireRef = useRef<LottieRefCurrentProps>(null);
  const sadRef = useRef<LottieRefCurrentProps>(null);
  const laughRef = useRef<LottieRefCurrentProps>(null);
  const lottieRefs: Record<ReactionType, RefObject<LottieRefCurrentProps | null>> = {
    LIKE: likeRef,
    LOVE: loveRef,
    FIRE: fireRef,
    SAD: sadRef,
    LAUGH: laughRef,
  };

  const countFor = (type: ReactionType): number =>
    Math.max(0, (counts?.[type] ?? 0) + (localDelta[type] ?? 0));

  const bump = (type: ReactionType, delta: number) =>
    setLocalDelta((prev) => ({ ...prev, [type]: (prev[type] ?? 0) + delta }));

  const preview = (type: ReactionType) => {
    lottieRefs[type].current?.goToAndPlay(0, true);
  };

  // The non-deselect half of handleClick, factored out so an external
  // trigger (double-tap on the card) can select a reaction the exact same
  // way a button click does — same bump/active/preview/onReact/onReacted.
  const selectReaction = (type: ReactionType) => {
    if (active) bump(active, -1);
    bump(type, 1);
    setActive(type);
    preview(type);
    onReact(type);
    onReacted?.(type);
  };

  const handleClick = (type: ReactionType) => {
    if (guardClick && !guardClick()) return;
    if (active === type) {
      bump(type, -1);
      setActive(null);
      if (onUnreact) onUnreact();
      else onReact(type);
      return;
    }
    selectReaction(type);
  };

  useEffect(() => {
    if (!externalTrigger) return;
    if (externalTrigger.nonce === lastExternalNonce.current) return;
    lastExternalNonce.current = externalTrigger.nonce;
    if (guardClick && !guardClick()) return;
    if (active === externalTrigger.type) return; // already reacted this way — no-op, double-tap never un-reacts
    // Genuinely belongs in an effect, not render: selectReaction calls
    // onReact, a real network request — running that during render (the
    // "adjust state during render" pattern used elsewhere in this codebase)
    // risks firing it more than once if React re-runs the render function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    selectReaction(externalTrigger.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger]);

  return (
    <div className="relative flex items-center gap-1 rounded-xl bg-brand/5 px-1.5 py-0.5 ring-1 ring-line/50 sm:gap-1.5">
      {REACTIONS.map((r) => {
        const count = countFor(r.type);
        const isActive = active === r.type;
        return (
          <button
            key={r.type}
            type="button"
            onClick={() => handleClick(r.type)}
            onMouseEnter={() => preview(r.type)}
            aria-label={r.type}
            aria-pressed={isActive}
            title={r.type}
            className={`flex scale-100 items-center gap-1 rounded-lg px-1 py-0.5 transition-all duration-200 active:scale-90 ${
              isActive ? "scale-110 bg-brand/15 ring-2 ring-brand" : "hover:bg-brand/10"
            }`}
          >
            <Lottie
              lottieRef={lottieRefs[r.type]}
              animationData={r.animationData}
              loop={false}
              autoplay={false}
              className="h-5 w-5 sm:h-6 sm:w-6"
            />
            {count > 0 && (
              <span
                className={`font-poppins text-[9px] font-semibold leading-none sm:text-[10px] ${
                  isActive ? "text-brand" : "text-brand/80"
                }`}
              >
                {compactNumber(count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
