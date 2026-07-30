"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { GistCard } from "./GistCard";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";
import type { Gist } from "@/types";

const SWIPE_THRESHOLD = 90; // px of horizontal drag to advance
const WINDOW_AHEAD = 3; // how many upcoming cards to keep mounted (the peek)
const HINT_SEEN_KEY = "kampos-swipe-hint-seen";

/** Resting transform for a card at a given stack offset from the front (0). */
function slotFor(offset: number) {
  if (offset < 0) {
    // Passed: fall out to the side, rotating away.
    return { x: "-130%", y: 0, rotate: -20, scale: 1, opacity: 0, zIndex: 60 };
  }
  // Front (0) and the peeking cards behind it rise up + straighten as they advance.
  const slots = [
    { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
    { x: 12, y: 14, rotate: 5, scale: 0.95, opacity: 0.9 },
    { x: 22, y: 26, rotate: 9, scale: 0.9, opacity: 0.6 },
    { x: 30, y: 36, rotate: 11, scale: 0.85, opacity: 0 },
  ];
  const s = slots[Math.min(offset, slots.length - 1)];
  return { ...s, zIndex: 40 - offset };
}

/**
 * The signature Kampos feed: a horizontal card stack. The front gist can be
 * dragged/flicked off to the side (rotating out) while the next rises into view
 * at an angle. Navigable by drag, arrow keys, and wheel/trackpad — no persistent
 * on-card buttons, so nothing ever sits on top of the card's content. A full,
 * unmissable gesture tutorial teaches the interaction the very first time —
 * it only goes away once the person actually swipes/scrolls/presses a key.
 */
// Once the front card gets within this many cards of the end of what's
// currently loaded, ask the parent for more — keeping this in the stack
// (not the feed page) since it's the stack that actually knows how close to
// the end the person browsing has gotten.
const NEAR_END_THRESHOLD = 5;

export function GistStack({
  gists,
  onCurrentChange,
  onGistDeleted,
  onGistEdited,
  onNearEnd,
}: {
  gists: Gist[];
  onCurrentChange?: (gist: Gist | undefined) => void;
  /** Bubbled up from GistCard's own delete action — the stack doesn't own
   * the gist list (the feed page does), so it just passes this straight
   * through. */
  onGistDeleted?: (gistId: string) => void;
  /** Same reasoning, for a successful edit. */
  onGistEdited?: () => void;
  /** Fires (repeatedly, whenever still within range) once the front card is
   * within NEAR_END_THRESHOLD of the end of `gists` — the parent owns
   * pagination and its own re-entrancy guard, so this can fire more than
   * once without needing to track "have we already asked" here. */
  onNearEnd?: () => void;
}) {
  const [index, setIndex] = useState(0);

  // The gist list is owned by the parent (feed page) and can shrink out from
  // under the stack (a delete) — clamped during render (not an effect,
  // avoiding a synchronous setState-in-effect cascade) so `index` never
  // points past the new end of the array.
  const [prevGistsLength, setPrevGistsLength] = useState(gists.length);
  if (gists.length !== prevGistsLength) {
    setPrevGistsLength(gists.length);
    if (index > gists.length - 1) setIndex(Math.max(gists.length - 1, 0));
  }

  const [showHint, setShowHint] = useState(false);
  // A ref, not state — the media overlay opening shouldn't itself trigger a
  // stack re-render, it just needs to be checkable inside the imperative
  // keydown/wheel handlers below at the moment a key/scroll actually fires.
  const overlayOpenRef = useRef(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(HINT_SEEN_KEY) === "true";
    } catch {
      /* storage unavailable — just don't show the hint */
    }
    if (!seen) setShowHint(true);
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "true");
    } catch {
      /* best-effort */
    }
  }, []);

  const next = useCallback(() => {
    dismissHint();
    setIndex((i) => Math.min(i + 1, gists.length - 1));
  }, [gists.length, dismissHint]);

  const prev = useCallback(() => {
    dismissHint();
    setIndex((i) => Math.max(i - 1, 0));
  }, [dismissHint]);

  useEffect(() => {
    onCurrentChange?.(gists[index]);
    if (index >= gists.length - NEAR_END_THRESHOLD) onNearEnd?.();
  }, [index, gists, onCurrentChange, onNearEnd]);

  // Keyboard navigation — a no-op while the media overlay is open on the
  // front card. Its own arrow-key handling (for the 2-media left/right case)
  // lives inside GistMediaOverlay itself, completely independently; this
  // just has to stay out of the way rather than also switching gists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpenRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Only left/right switch cards. Up/Down are left for scrolling card content.
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Wheel / trackpad: ONLY horizontal intent switches cards. Vertical wheel is
  // left alone so it scrolls the card's content (never advances the feed).
  // Also a no-op while the media overlay is open, same reasoning as above.
  const wheelLock = useRef(false);
  const onWheel = (e: React.WheelEvent) => {
    if (overlayOpenRef.current) return;
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) + 6;
    if (!horizontal || Math.abs(e.deltaX) < 24 || wheelLock.current) return;
    wheelLock.current = true;
    if (e.deltaX > 0) next();
    else prev();
    window.setTimeout(() => (wheelLock.current = false), 420);
  };

  const handleDragEnd = (info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -500) next();
    else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 500) prev();
  };

  return (
    <div
      className="relative flex w-full flex-1 justify-center select-none"
      onWheel={onWheel}
    >
      <div className="relative h-full w-full max-w-[620px] md:max-w-[740px]">
        {gists.map((gist, i) => {
          const offset = i - index;
          if (offset < -1 || offset > WINDOW_AHEAD) return null;
          const isFront = offset === 0;
          const slot = slotFor(offset);
          return (
            <motion.div
              key={gist.gist_id}
              className="absolute inset-0 will-change-transform"
              style={{ zIndex: slot.zIndex }}
              initial={false}
              animate={{
                x: slot.x,
                y: slot.y,
                rotate: slot.rotate,
                scale: slot.scale,
                opacity: slot.opacity,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              drag={isFront ? "x" : false}
              dragElastic={0.5}
              dragConstraints={{ left: 0, right: 0 }}
              whileDrag={{ cursor: "grabbing" }}
              onDragEnd={(_, info) => handleDragEnd(info)}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[32px] shadow-[0_24px_60px_-24px_rgba(9,30,66,0.55)] ring-1 ring-black/5">
                <GistCard
                  gist={gist}
                  isActive={isFront}
                  onOverlayOpenChange={(open) => {
                    overlayOpenRef.current = open;
                  }}
                  onDeleted={onGistDeleted}
                  onEdited={onGistEdited}
                />
                {/* Swipe-peek tease: peeking cards (offset > 0) already sit
                    rotated/offset behind the front card, so a sliver of their
                    right edge sticks out during a drag. Painting the gist's
                    first media item right there means a person glimpses the
                    actual photo/video while swiping past — before they've
                    even arrived at the card — only possible because of this
                    horizontal stack, not a bolt-on UI affordance.

                    An <img> can't render a video file, so a video item only
                    gets a peek when it actually has a thumbnail_url (a real
                    poster frame) — if not, skip the peek entirely rather
                    than try to load the raw .mp4 as an image and silently
                    fail. */}
                {(() => {
                  const first = gist.media?.[0];
                  if (offset <= 0 || !first) return null;
                  const isVideo = first.media_type?.toLowerCase().includes("video");
                  const previewSrc = isVideo ? first.thumbnail_url : first.media_url || first.thumbnail_url;
                  if (!previewSrc) return null;
                  return (
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-16 overflow-hidden sm:w-20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewSrc} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-r from-surface-2 via-surface-2/30 to-transparent" />
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          );
        })}

        {showHint && <SwipeHint />}
      </div>
    </div>
  );
}

/**
 * One-time gesture tutorial: big, centered over the card, with a dark scrim
 * behind it so it's unmissable regardless of what's on the card underneath.
 * It does NOT auto-dismiss on a timer — it only clears once the person
 * actually swipes, drags, presses an arrow key, or scrolls horizontally
 * (i.e. once `next`/`prev` really fires). Not button-shaped (no circular
 * badges) so nothing here reads as a clickable control.
 */
function SwipeHint() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[70] flex items-center justify-center overflow-hidden rounded-[32px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Dark scrim so the tutorial reads clearly over any card content */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, rgba(5,9,18,0.82) 0%, rgba(5,9,18,0.6) 45%, rgba(5,9,18,0.25) 72%, transparent 90%)",
        }}
      />

      <div className="relative flex items-center gap-6 px-6 sm:gap-10">
        <motion.div
          animate={{ x: [0, -16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronLeft className="h-12 w-12 text-white sm:h-16 sm:w-16" />
        </motion.div>

        <span className="text-center font-poppins text-xl font-semibold text-white sm:text-3xl">
          <span className="md:hidden">Swipe to browse</span>
          <span className="hidden md:inline">Press ← → to browse</span>
        </span>

        <motion.div
          animate={{ x: [0, 16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronRight className="h-12 w-12 text-white sm:h-16 sm:w-16" />
        </motion.div>
      </div>
    </motion.div>
  );
}
