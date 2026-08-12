"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { GistCard } from "./GistCard";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "@/components/ui/icons";
import { useIsMobile } from "@/lib/useIsMobile";
import type { Gist } from "@/types";

const SWIPE_THRESHOLD = 90; // px of horizontal drag to advance — desktop only, see isMobile below
const WINDOW_AHEAD = 3; // how many upcoming cards to keep mounted (the peek) — desktop only, see isMobile below
const HINT_SEEN_KEY = "kampos-swipe-hint-seen";
// On mobile the card is already at (near-)full screen width, so the stacked
// peek behind it reads as cramped/broken rather than a tease — the split
// with the mobile-only comment input below the card (see FeedContent)
// shrinks the card's own height too, which made the peek's rotation/offset
// spill past the card's own bounds. Desktop, with room to spare on both
// axes, keeps the peek.

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

// Mobile's RESTING pose only — matching the reference in Kampos-frontend's
// AnimatedGist: no 3D flip, no hinge, just a full-card-width slide plus a
// light, consistent 20° tilt in the direction of travel. Purely translateX
// + a small rotate, nothing fancier. The actual LIVE motion (both while
// dragging and mid-release-spring) is computed in GistStackCard instead,
// driven continuously by dragProgress — this function is what that live
// system settles into at dragProgress = 0 (and the fallback for any
// offset outside the {-1, 0, 1} range the live formulas actually cover,
// which desktop's own offsets can reach but mobile's never do). zIndex
// here is intentionally the SAME for both waiting neighbors (20) since,
// at rest, neither is "becoming front" — GistStackCard's own live zIndex
// is what grades by direction once a drag is actually in progress,
// whichever neighbor is being approached painting above the current front
// while they cross paths.
function mobileSlotFor(offset: number) {
  if (offset < 0) return { x: "-100%", y: 0, rotate: -20, scale: 1, opacity: 1, zIndex: 20 };
  if (offset === 0) return { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, zIndex: 50 };
  return { x: "100%", y: 0, rotate: 20, scale: 1, opacity: 1, zIndex: 20 };
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
  initialIndex = 0,
  onCurrentChange,
  onGistDeleted,
  onGistEdited,
  onNearEnd,
  mediaPaused = false,
}: {
  gists: Gist[];
  /** Opens the stack on a specific gist instead of always the front (index
   * 0) — the shared-link view uses this to land directly on the gist that
   * was actually shared, with its chronological neighbors either side. */
  initialIndex?: number;
  onCurrentChange?: (gist: Gist | undefined) => void;
  /** Bubbled up from GistCard's own delete action — the stack doesn't own
   * the gist list (the feed page does), so it just passes this straight
   * through. */
  onGistDeleted?: (gistId: string) => void;
  /** Same reasoning, for a successful edit — carries the fresh gist. */
  onGistEdited?: (gist: Gist) => void;
  /** Fires (repeatedly, whenever still within range) once the front card is
   * within NEAR_END_THRESHOLD of the end of `gists` — the parent owns
   * pagination and its own re-entrancy guard, so this can fire more than
   * once without needing to track "have we already asked" here. */
  onNearEnd?: () => void;
  /** True while something feed-level is covering the card (the comment
   * sheet, the new-gist compose sheet) — the front card's own video should
   * pause for the same reason it already pauses for peeking/inactive cards,
   * not stay playing (and audible) underneath a modal that has focus. */
  mediaPaused?: boolean;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(gists.length - 1, 0)));
  const isMobile = useIsMobile();

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
  // Stable identity across every index change — GistCard is memoized (see
  // its own docstring) specifically so most of the mounted stack skips
  // re-rendering on a scroll step; passing a fresh inline closure here for
  // this prop on every render would silently defeat that for every single
  // card, every time.
  const handleOverlayOpenChange = useCallback((open: boolean) => {
    overlayOpenRef.current = open;
  }, []);

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

  // Guards against a single real swipe getting counted twice — the
  // horizontal drag (Framer's own pointer-based system) and the vertical
  // overscroll pull (a separate touch-based one, see useOverscrollNav) are
  // two independent gesture detectors watching the same touch. A real
  // thumb flick is rarely perfectly straight, so an almost-vertical swipe
  // can have just enough sideways drift to ALSO cross the horizontal
  // drag's own threshold — both systems then independently call next()
  // for what was physically one swipe, skipping two gists instead of one.
  // Since any such double-fire lands within the same touch-release tick,
  // a short cross-source debounce (much shorter than the per-gesture-type
  // wheelLock below, which solves a different problem) absorbs the
  // duplicate without adding any perceptible delay to genuinely separate,
  // deliberate consecutive swipes.
  const lastNavAtRef = useRef(0);
  const NAV_DEBOUNCE_MS = 150;

  const next = useCallback(() => {
    const now = Date.now();
    if (now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return;
    lastNavAtRef.current = now;
    dismissHint();
    setIndex((i) => Math.min(i + 1, gists.length - 1));
  }, [gists.length, dismissHint]);

  const prev = useCallback(() => {
    const now = Date.now();
    if (now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return;
    lastNavAtRef.current = now;
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

  // Desktop-only — mobile drops horizontal drag entirely (see GistStackCard):
  // it was fighting the vertical overscroll-pull gesture for the same touch,
  // producing a visible shake as both tried to move the card at once. Wheel
  // and keyboard aren't touch-based, so they don't have that conflict and
  // stay exactly as they were, on both platforms.
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
          // Desktop mounts the whole cascading peek (WINDOW_AHEAD deep).
          // Mobile only ever needs the immediate neighbor on either side —
          // one card mid-slide-out (-1), one card waiting to slide in
          // (+1) — since its transition is driven by those two slots alone,
          // not a stack.
          if (isMobile && offset > 1) return null;
          return (
            <GistStackCard
              key={gist.gist_id}
              gist={gist}
              offset={offset}
              isMobile={isMobile}
              mediaPaused={mediaPaused}
              handleOverlayOpenChange={handleOverlayOpenChange}
              onGistDeleted={onGistDeleted}
              onGistEdited={onGistEdited}
              next={next}
              prev={prev}
              handleDragEnd={handleDragEnd}
            />
          );
        })}

        {showHint && <SwipeHint />}
      </div>
    </div>
  );
}

/**
 * A single card's slot in the stack — split out from GistStack's own render
 * specifically so it can own its own `dragProgress` motion value (a hook
 * call inside a raw `.map()` isn't legal; a proper per-item component,
 * keyed the same way the map already was, is).
 *
 * `dragProgress` is the vertical-overscroll gesture's shared value for this
 * one card — GistCard and its media sub-components only ever read/write it
 * (see useOverscrollNav), but this component is what actually turns it into
 * a visible transform. It's a normalized progress from -1 to 1 (0 = at
 * rest, ±1 = fully transitioned), NOT a pixel offset, and it drives the
 * card's position LIVE, every frame, while the gesture is happening — not
 * just after it ends. That's deliberate: it's what makes the whole
 * horizontal fly-off animate in real time as a vertical finger-drag
 * happens, instead of the drag itself being invisible and a completely
 * separate animation only starting once you let go (which used to read as
 * two stitched-together motions instead of one).
 *
 * Desktop is untouched by any of this — it keeps its original, simpler
 * discrete-slot system (mouse drag directly manipulates the same x/rotate
 * targets Framer's own `animate` prop uses, so it was already continuous by
 * construction; only the newer vertical-touch gesture needed this).
 */
function GistStackCard({
  gist,
  offset,
  isMobile,
  mediaPaused,
  handleOverlayOpenChange,
  onGistDeleted,
  onGistEdited,
  next,
  prev,
  handleDragEnd,
}: {
  gist: Gist;
  offset: number;
  isMobile: boolean;
  mediaPaused: boolean;
  handleOverlayOpenChange: (open: boolean) => void;
  onGistDeleted?: (gistId: string) => void;
  onGistEdited?: (gist: Gist) => void;
  next: () => void;
  prev: () => void;
  handleDragEnd: (info: PanInfo) => void;
}) {
  const isFront = offset === 0;
  // Called unconditionally regardless of isMobile (which can itself change
  // live on a resize crossing the breakpoint — see useIsMobile) so every
  // hook below runs in the same order every render; which VALUES actually
  // get used is decided further down, after all hooks have run.
  const dragProgress = useMotionValue(0);
  // Where the vertical-overscroll gesture's touch listeners actually
  // attach — the WHOLE card frame below (header, body, footer, all of
  // it), not just the scrollable content inside it, so the gesture works
  // no matter where on the card a thumb lands. See useOverscrollNav's own
  // docs for why this is a separate ref from the one that measures scroll
  // position.
  const touchSurfaceRef = useRef<HTMLDivElement>(null);

  // Desktop's own discrete resting slot — computed unconditionally
  // (cheap), only actually used in the desktop branch below.
  const desktopSlot = slotFor(offset);

  // Mobile's live position — three cards ever mount there (offset -1, 0,
  // 1; see the render loop above), and only ONE of them ever reacts to a
  // given drag direction at a time:
  //  - offset 0 (front): interpolates toward whichever exit pose matches
  //    the drag's sign (negative = toward "next", left; positive = toward
  //    "prev", right) — the only card that always moves.
  //  - offset 1 (waiting at the right): only interpolates toward center
  //    while dragProgress is negative (a "next" pull) — clamped, so a
  //    "prev" pull (positive) leaves it untouched at its resting x:"100%".
  //  - offset -1 (waiting at the left): the mirror image — only reacts to
  //    positive (a "prev" pull), clamped still at x:"-100%" otherwise.
  // At dragProgress = 0 (rest), all three formulas below already evaluate
  // to exactly mobileSlotFor's own resting values — this isn't a
  // coincidence, it's what lets the live system fully replace the old
  // discrete one instead of needing to hand off between them.
  const liveX = useTransform(dragProgress, (p) => {
    if (offset === 0) return `${p * 100}%`;
    if (offset === 1) return `${100 + Math.min(0, p) * 100}%`;
    if (offset === -1) return `${-100 + Math.max(0, p) * 100}%`;
    return mobileSlotFor(offset).x;
  });
  const liveRotate = useTransform(dragProgress, (p) => {
    if (offset === 0) return p * 20;
    if (offset === 1) return 20 + Math.min(0, p) * 20;
    if (offset === -1) return -20 + Math.max(0, p) * 20;
    return mobileSlotFor(offset).rotate;
  });
  // z-index needs the card being actively dragged TOWARD to paint above
  // the current front while they cross paths mid-drag — unlike the old
  // discrete system (which only ever swapped position at the instant of
  // commit, never showing a live overlap), the two cards now visibly slide
  // past each other, so getting this backwards would show the leaving card
  // on top of the arriving one during the crossover.
  const liveZIndex = useTransform(dragProgress, (p) => {
    if (offset === 0) return 40;
    if (offset === 1) return p < 0 ? 60 : 20;
    if (offset === -1) return p > 0 ? 60 : 20;
    return mobileSlotFor(offset).zIndex;
  });

  if (isMobile) {
    return (
      <motion.div
        className="absolute inset-0 will-change-transform"
        style={{
          zIndex: liveZIndex,
          x: liveX,
          rotate: liveRotate,
          pointerEvents: isFront ? "auto" : "none",
        }}
      >
        <div
          ref={touchSurfaceRef}
          className="relative h-full w-full overflow-hidden rounded-[32px] shadow-[0_24px_60px_-24px_rgba(9,30,66,0.55)] ring-1 ring-black/5"
        >
          <GistCard
            gist={gist}
            isActive={isFront && !mediaPaused}
            onOverlayOpenChange={handleOverlayOpenChange}
            onDeleted={onGistDeleted}
            onEdited={onGistEdited}
            onNext={isFront ? next : undefined}
            onPrev={isFront ? prev : undefined}
            touchSurfaceRef={touchSurfaceRef}
            dragProgress={dragProgress}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 will-change-transform"
      style={{ zIndex: desktopSlot.zIndex, pointerEvents: isFront ? "auto" : "none" }}
      initial={false}
      animate={{
        x: desktopSlot.x,
        y: desktopSlot.y,
        rotate: desktopSlot.rotate,
        scale: desktopSlot.scale,
        opacity: desktopSlot.opacity,
      }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      drag={isFront ? "x" : false}
      dragElastic={0.5}
      dragConstraints={{ left: 0, right: 0 }}
      whileDrag={{ cursor: "grabbing" }}
      onDragEnd={(_, info) => handleDragEnd(info)}
    >
      <div
        ref={touchSurfaceRef}
        className="relative h-full w-full overflow-hidden rounded-[32px] shadow-[0_24px_60px_-24px_rgba(9,30,66,0.55)] ring-1 ring-black/5"
      >
        <GistCard
          gist={gist}
          isActive={isFront && !mediaPaused}
          onOverlayOpenChange={handleOverlayOpenChange}
          onDeleted={onGistDeleted}
          onEdited={onGistEdited}
          onNext={isFront ? next : undefined}
          onPrev={isFront ? prev : undefined}
          touchSurfaceRef={touchSurfaceRef}
          dragProgress={dragProgress}
        />
        {/* Swipe-peek tease (desktop only). Peeking cards (offset > 0)
            already sit rotated/offset behind the front card, so a sliver
            of their right edge sticks out during a drag. Painting the
            gist's first media item right there means a person glimpses
            the actual photo/video while swiping past — before they've
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

      {/* Mobile: up/down, matching the vertical overscroll-pull gesture —
          horizontal drag was dropped there (see GistStackCard) since it
          fought the vertical one for the same touch, so left/right chevrons
          would now be teaching a gesture that no longer does anything. */}
      <div className="flex flex-col items-center gap-4 px-6 md:hidden">
        <motion.div
          animate={{ y: [0, -16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronUp className="h-12 w-12 text-white" />
        </motion.div>
        <span className="text-center font-nunito text-xl font-semibold text-white">Scroll to browse</span>
        <motion.div
          animate={{ y: [0, 16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-12 w-12 text-white" />
        </motion.div>
      </div>

      {/* Desktop: unchanged — drag and wheel both still work here too, but
          the keyboard is the one thing with no other visible affordance. */}
      <div className="hidden items-center gap-10 px-6 md:flex">
        <motion.div
          animate={{ x: [0, -16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronLeft className="h-16 w-16 text-white" />
        </motion.div>
        <span className="text-center font-nunito text-3xl font-semibold text-white">Press ← → to browse</span>
        <motion.div
          animate={{ x: [0, 16, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronRight className="h-16 w-16 text-white" />
        </motion.div>
      </div>
    </motion.div>
  );
}
