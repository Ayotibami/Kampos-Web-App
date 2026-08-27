"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { GistCard } from "./GistCard";
import { MediaImage } from "@/components/ui/MediaFrame";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "@/components/ui/icons";
import { useIsMobile } from "@/lib/useIsMobile";
import { EXIT_DISTANCE_PX, COMMIT_EXIT_S } from "@/lib/useOverscrollNav";
import type { Gist } from "@/types";

const SWIPE_THRESHOLD = 90; // px of horizontal drag to advance — desktop only, see isMobile below
const WINDOW_AHEAD = 3; // how many upcoming cards to keep mounted (the peek) — desktop only, see isMobile below
const HINT_SEEN_KEY = "kampos-swipe-hint-seen";
// On mobile the card is already at (near-)full screen width, so the stacked
// peek behind it reads as cramped/broken rather than a tease — the split
// with the mobile-only comment input below the card (see FeedContent)
// shrinks the card's own height too. Desktop, with room to spare on both
// axes, keeps the peek. Mobile only ever mounts the one front card (see
// GistStack's render below) — no neighbor sits behind it to peek at — but
// see GistStackCard's own mobile branch for the live-tracked transition
// that plays when it changes.

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
  initialIndex = 0,
  onCurrentChange,
  onGistDeleted,
  onGistEdited,
  onNearEnd,
  mediaPaused = false,
  resetToTopSignal,
  showCampusTag = true,
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
  /** Bump this (any new value) to snap back to the first card — e.g. after
   * a pull-to-refresh, where a freshly-fetched list at the same numeric
   * position you were on would otherwise show a completely different,
   * effectively random gist with no explanation. A plain length change
   * doesn't catch this: the refreshed list is usually the same size, just
   * different contents, so the existing length-based clamp below never
   * fires for it. */
  resetToTopSignal?: number;
  /** Passed straight through to every GistCard — see its own doc comment.
   * Amebo mixes schools so the campus chip is real information there;
   * Gist is already scoped to one school, so the feed page passes false
   * to drop the redundant chip on every card. */
  showCampusTag?: boolean;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(gists.length - 1, 0)));
  const isMobile = useIsMobile();

  // The gist list is owned by the parent (feed page) and its identity can
  // change out from under the stack for reasons that have nothing to do
  // with the user navigating — most notably a background refresh after the
  // offline queue syncs (see FeedContent's kampos:gists-synced listener),
  // which re-fetches page one fresh and can land the same gists in a
  // different order (decay-score re-ranking, a newly-synced gist inserted
  // near the top). Re-pointing `index` at wherever the card the user was
  // actually looking at ended up keeps that card on screen through a
  // reorder instead of silently swapping in whatever now sits at the same
  // numeric slot — which is what was producing the "why did the feed just
  // scroll to something else" jump on reconnect. Falls back to the old
  // length-based clamp when the gist genuinely isn't in the new list at all
  // (it fell out of a fresh page-one fetch, or was deleted) — same as
  // before. Render-phase, not an effect, to avoid a setState-in-effect
  // cascade, same as the resetToTopSignal clamp below.
  const [prevGists, setPrevGists] = useState(gists);
  if (gists !== prevGists) {
    const priorId = prevGists[index]?.gist_id;
    setPrevGists(gists);
    if (priorId !== undefined && gists[index]?.gist_id !== priorId) {
      const newPos = gists.findIndex((g) => g.gist_id === priorId);
      if (newPos !== -1) {
        setIndex(newPos);
      } else if (index > gists.length - 1) {
        setIndex(Math.max(gists.length - 1, 0));
      }
    } else if (index > gists.length - 1) {
      setIndex(Math.max(gists.length - 1, 0));
    }
  }

  // Same render-phase-clamp pattern as above, not an effect — snaps back
  // to the first card whenever the parent bumps resetToTopSignal.
  const [prevResetSignal, setPrevResetSignal] = useState(resetToTopSignal);
  if (resetToTopSignal !== undefined && resetToTopSignal !== prevResetSignal) {
    setPrevResetSignal(resetToTopSignal);
    if (index !== 0) setIndex(0);
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
  //
  // Mobile-only exemption: mobile never mounts Framer's horizontal `drag`
  // (see GistStackCard's isMobile branch) — the overscroll-pull touch
  // listener is the ONLY gesture detector watching a mobile touch, so
  // there's no second detector for it to ever double-fire against. Without
  // this exemption, two genuinely separate, deliberate fast swipes on
  // mobile could have the second one silently dropped by a debounce that's
  // solving a desktop-only problem.
  const lastNavAtRef = useRef(0);
  const NAV_DEBOUNCE_MS = 150;

  // Mobile-only: which side the incoming card's entrance animation rises
  // in from (see GistStackCard's own mobile branch) — +1 for next (rises
  // from below), -1 for prev (rises from above). Set in the same event
  // handler as setIndex, so React 18's automatic batching applies both in
  // the same render — the render that shows the new gist always sees the
  // direction that produced it. Only actually consulted on MOUNT (a fresh
  // gist_id key means a fresh component instance), since a drag-committed
  // transition already knows its own direction from the drag itself —
  // this only matters for how the new card enters, never how the old one
  // leaves.
  const [direction, setDirection] = useState(1);

  const next = useCallback(() => {
    const now = Date.now();
    if (!isMobile && now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return;
    lastNavAtRef.current = now;
    dismissHint();
    setDirection(1);
    setIndex((i) => Math.min(i + 1, gists.length - 1));
  }, [gists.length, dismissHint, isMobile]);

  const prev = useCallback(() => {
    const now = Date.now();
    if (!isMobile && now - lastNavAtRef.current < NAV_DEBOUNCE_MS) return;
    lastNavAtRef.current = now;
    dismissHint();
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  }, [dismissHint, isMobile]);

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
        {isMobile ? (
          // Mobile: exactly one card. No AnimatePresence needed here
          // anymore — a committed swipe now finishes its own exit
          // animation FIRST (see useOverscrollNav) and only calls next()/
          // prev() once that's done, so `gists[index]` (and therefore
          // this card) doesn't actually change until the outgoing card is
          // already fully off-screen. Nothing ever needs to stay mounted
          // past its own removal to finish animating out.
          gists[index] && (
            <GistStackCard
              key={gists[index].gist_id}
              gist={gists[index]}
              offset={0}
              isMobile
              direction={direction}
              mediaPaused={mediaPaused}
              showCampusTag={showCampusTag}
              handleOverlayOpenChange={handleOverlayOpenChange}
              onGistDeleted={onGistDeleted}
              onGistEdited={onGistEdited}
              next={next}
              prev={prev}
              handleDragEnd={handleDragEnd}
            />
          )
        ) : (
          // Desktop: unchanged — the whole cascading peek (WINDOW_AHEAD deep).
          gists.map((gist, i) => {
            const offset = i - index;
            if (offset < -1 || offset > WINDOW_AHEAD) return null;
            return (
              <GistStackCard
                key={gist.gist_id}
                gist={gist}
                offset={offset}
                isMobile={false}
                direction={1}
                mediaPaused={mediaPaused}
                showCampusTag={showCampusTag}
                handleOverlayOpenChange={handleOverlayOpenChange}
                onGistDeleted={onGistDeleted}
                onGistEdited={onGistEdited}
                next={next}
                prev={prev}
                handleDragEnd={handleDragEnd}
              />
            );
          })
        )}

        {showHint && <SwipeHint />}
      </div>
    </div>
  );
}

/**
 * A single card's slot in the stack. Desktop: the signature dragged/rotated
 * peek-stack (unchanged — see slotFor). Mobile: only the front card is ever
 * mounted here (see GistStack's own render) — its own `dragY` motion value
 * (shared down into GistCard and, for a media gist, further into
 * GistMediaBackdrop/GistMediaBodyPanel — see useOverscrollNav's own
 * docstring) drives its position live: it follows a claimed drag frame by
 * frame, springs back if the drag didn't cross the swipe threshold, or
 * finishes flying off-screen if it did — all owned by useOverscrollNav,
 * this component just renders wherever that value currently is. The one
 * animation this component DOES own directly is the entrance: a freshly
 * mounted card (a new gist_id key, so a fresh instance and a fresh dragY
 * starting at 0) starts off-screen on the side `direction` points to and
 * rises up to rest.
 */
function GistStackCard({
  gist,
  offset,
  isMobile,
  direction,
  mediaPaused,
  showCampusTag,
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
  /** Mobile only — which side a freshly mounted card's entrance rises in
   * from. See GistStack's own direction state. Unused on desktop. */
  direction: number;
  mediaPaused: boolean;
  showCampusTag: boolean;
  handleOverlayOpenChange: (open: boolean) => void;
  onGistDeleted?: (gistId: string) => void;
  onGistEdited?: (gist: Gist) => void;
  next: () => void;
  prev: () => void;
  handleDragEnd: (info: PanInfo) => void;
}) {
  const isFront = offset === 0;
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

  // Mobile's own live position — computed unconditionally (same reasoning
  // as desktopSlot above) even though only the mobile branch uses it.
  // Owned here (not inside useOverscrollNav) because it has to be shared
  // across THREE separate call sites of that hook depending on what's
  // currently showing (see this component's own docstring) — one value,
  // passed down as a prop to whichever of them is actually active.
  const dragY = useMotionValue(0);
  // Fades out as the card nears either exit distance — derived FROM dragY
  // rather than tracked as its own state, so it automatically stays in
  // lockstep with wherever dragY actually is: live during a drag, back to
  // fully opaque on a cancelled swipe, fading out on a committed one, with
  // nothing separate to keep in sync by hand.
  const opacity = useTransform(dragY, [-EXIT_DISTANCE_PX, 0, EXIT_DISTANCE_PX], [0, 1, 0]);

  // Entrance only — a fresh mount (fresh gist_id key, fresh dragY at 0)
  // starts off-screen on whichever side `direction` points to and rises to
  // rest. Exit is handled entirely by useOverscrollNav, which is why this
  // effect never needs to run again for the SAME card later on.
  useEffect(() => {
    if (!isMobile) return;
    dragY.set(direction > 0 ? EXIT_DISTANCE_PX : -EXIT_DISTANCE_PX);
    const controls = animate(dragY, 0, { duration: COMMIT_EXIT_S, ease: "easeOut" });
    return () => controls.stop();
    // Deliberately mount-only — `direction` describes how THIS card
    // arrived, not something that should retrigger the entrance if it
    // changes later for an unrelated reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isMobile) {
    // Always the front card — GistStack's render loop never mounts any
    // other offset on mobile — so there's nothing to key this on.
    return (
      <motion.div className="absolute inset-0 will-change-transform" style={{ y: dragY, opacity }}>
        <div
          ref={touchSurfaceRef}
          className="relative h-full w-full overflow-hidden rounded-[32px] shadow-[0_24px_60px_-24px_rgba(9,30,66,0.55)] ring-1 ring-black/5"
        >
          <GistCard
            gist={gist}
            isActive={!mediaPaused}
            showCampusTag={showCampusTag}
            onOverlayOpenChange={handleOverlayOpenChange}
            onDeleted={onGistDeleted}
            onEdited={onGistEdited}
            onNext={next}
            onPrev={prev}
            touchSurfaceRef={touchSurfaceRef}
            dragY={dragY}
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
          showCampusTag={showCampusTag}
          onOverlayOpenChange={handleOverlayOpenChange}
          onDeleted={onGistDeleted}
          onEdited={onGistEdited}
          onNext={isFront ? next : undefined}
          onPrev={isFront ? prev : undefined}
          touchSurfaceRef={touchSurfaceRef}
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
              <MediaImage src={previewSrc} alt="" className="h-full w-full object-cover" />
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
