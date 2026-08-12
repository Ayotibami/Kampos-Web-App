"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, AnimatePresence, type MotionValue } from "framer-motion";
import { useOverscrollNav } from "@/lib/useOverscrollNav";
import {
  ChevronDown,
  VolumeIconFill,
  MuteIconFill,
  PlayIconFill,
  PauseIconFill,
  ExpandIconFill,
} from "@/components/ui/icons";
import type { GistMedia as GistMediaType } from "@/types";
import { cloudinarySmartCrop } from "@/lib/cloudinary";
import { useIsMobile } from "@/lib/useIsMobile";

// Chars are tuned per breakpoint so the slice actually fits within that
// breakpoint's line-clamp (2/4/3 lines below) — not just visually similar,
// but enough that the "…more" affordance we append isn't itself clipped off
// by the line-clamp before it ever gets shown. Mobile is deliberately capped
// at 2 lines (a small char budget) so the caption stays short enough to
// leave the media beneath it tappable, instead of covering most of the card.
const PREVIEW_CHARS_BY_BREAKPOINT = { mobile: 80, sm: 160, md: 110 } as const;

/** Tracks which Tailwind breakpoint we're at (sm: 640px, md: 768px) via
 * matchMedia, so the preview length can respond to real viewport width. */
function usePreviewChars(): number {
  const [chars, setChars] = useState<number>(PREVIEW_CHARS_BY_BREAKPOINT.mobile);

  useEffect(() => {
    const mdQuery = window.matchMedia("(min-width: 768px)");
    const smQuery = window.matchMedia("(min-width: 640px)");
    const update = () => {
      if (mdQuery.matches) setChars(PREVIEW_CHARS_BY_BREAKPOINT.md);
      else if (smQuery.matches) setChars(PREVIEW_CHARS_BY_BREAKPOINT.sm);
      else setChars(PREVIEW_CHARS_BY_BREAKPOINT.mobile);
    };
    update();
    mdQuery.addEventListener("change", update);
    smQuery.addEventListener("change", update);
    return () => {
      mdQuery.removeEventListener("change", update);
      smQuery.removeEventListener("change", update);
    };
  }, []);

  return chars;
}

/** First N chars of the gist text (N depending on viewport — see
 * usePreviewChars), written directly on the media (WhatsApp-status-caption
 * style) — a real taste of the gist, not just a generic "tap to read". No
 * ellipsis baked in — the caller appends its own "…more" affordance when
 * `truncated`. */
function previewText(text: string, maxChars: number): { preview: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return { preview: trimmed, truncated: false };
  return { preview: trimmed.slice(0, maxChars).trimEnd(), truncated: true };
}

function MediaFrame({
  item,
  isLead,
  playing,
  onTogglePlay,
  active = true,
  blurred,
  overlayOpen,
  onExpand,
}: {
  item: GistMediaType;
  /** The tile that defaults to autoplaying (idx 0). Only used here to decide
   * the starting mute state — see below. */
  isLead: boolean;
  /** Controlled by the parent (GistMediaBackdrop) — it's the one that knows
   * about the sibling tile too, so "only one plays at a time" lives there,
   * not as independent state per tile. */
  playing: boolean;
  onTogglePlay: () => void;
  /** False for gists peeking behind the front card in the swipe stack — only
   * the actual front/current card should ever be playing audio/video. */
  active?: boolean;
  blurred?: boolean;
  /** True while the bigger overlay view is open on this gist — its own
   * video takes over playback then, so the in-card one has to pause; two
   * copies of the same video (and audio) playing at once makes no sense. */
  overlayOpen?: boolean;
  /** Opens the bigger overlay — for video this is a dedicated button (see
   * below), since tapping the video itself now toggles mute instead, X-style. */
  onExpand?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = item.media_type?.toLowerCase().includes("video");
  // object-top, not the default centered crop — a center crop sliced a
  // portrait photo's head off just as often as its feet, which reads as
  // broken; biasing the crop to the top instead means whatever's cut is
  // consistently the bottom, and the subject (a face, a header, the top of
  // whatever's in frame) survives almost every photo. Matches how Twitter's
  // own feed-card crop behaves.
  const className = `h-full w-full object-cover object-top ${blurred ? "scale-110 blur-2xl" : ""}`;

  // Whether THIS tile's controls should even show — any video tile, once
  // its card is the front one, not blurred into text mode, and the bigger
  // overlay isn't currently open on top of it.
  const canControl = active && !blurred && !overlayOpen;

  // Browsers block autoplay-WITH-sound outright unless it starts muted — but
  // that rule only applies to autoplay. The lead tile autoplays silently on
  // its own, so it has to start muted. The non-lead tile never autoplays —
  // it only ever plays from a direct tap on its own play button, which *is*
  // real user consent, so there's no reason to make them unmute separately
  // right after already telling it to play.
  const [muted, setMuted] = useState(isLead);
  const shouldPlay = canControl && playing;

  // The backdrop stays mounted across mode switches AND across a card
  // becoming/un-becoming the front card in the stack (so it can blur, and so
  // a peeking card doesn't just vanish), so toggling props alone does
  // nothing to an already-playing video — it needs an imperative pause/play.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) video.play().catch(() => {});
    else video.pause();
  }, [shouldPlay]);

  if (!isVideo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cloudinarySmartCrop(item.media_url)}
        alt=""
        className={className}
        // <img> is natively draggable by default — on iOS Safari that can
        // mean a touch on the image gets partly claimed by the browser's
        // own drag-to-save gesture recognition before the vertical
        // overscroll-pull's touch listener (see useOverscrollNav) ever gets
        // a clean, uninterrupted read of it — text-only gists have no <img>
        // in the way, so they were never affected, only image tiles were.
        // draggable={false} (plus the CSS belt-and-suspenders below) turns
        // that native gesture off entirely.
        draggable={false}
        style={{ WebkitUserDrag: "none" } as React.CSSProperties}
      />
    );
  }

  return (
    <div
      className="relative h-full w-full"
      // Tapping the video: the FIRST tap unmutes (the more likely first
      // action while scrolling past sound-off content); once already
      // unmuted, subsequent taps toggle play/pause instead — mute doesn't
      // need to be re-toggled every tap once it's already been handled once.
      onClick={
        canControl
          ? () => {
              if (muted) setMuted(false);
              else onTogglePlay();
            }
          : undefined
      }
    >
      <video
        ref={videoRef}
        src={item.media_url}
        poster={item.thumbnail_url}
        autoPlay={shouldPlay}
        muted={muted}
        loop={shouldPlay}
        playsInline
        className={className}
      />
      {canControl && (
        <>
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
            {/* onPointerDownCapture stops the video's own onClick (mute/play
                toggle) from also seeing a press that started on these
                buttons — belt-and-suspenders alongside onClick's own
                stopPropagation below. */}
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={playing ? "pause" : "play"}
                  className="flex"
                  initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {playing ? (
                    <PauseIconFill className="h-3.5 w-3.5" weight="duotone" />
                  ) : (
                    <PlayIconFill className="h-3.5 w-3.5" weight="duotone" />
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={muted ? "muted" : "unmuted"}
                  className="flex"
                  initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {muted ? (
                    <MuteIconFill className="h-3.5 w-3.5" weight="duotone" />
                  ) : (
                    <VolumeIconFill className="h-3.5 w-3.5" weight="duotone" />
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
          {/* Expand — the dedicated, explicit way to open the bigger overlay
              now that a plain tap on the video means "toggle mute" instead. */}
          <button
            type="button"
            aria-label="Expand"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.();
            }}
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            <ExpandIconFill className="h-3.5 w-3.5" weight="duotone" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Media backdrop scoped to the body slot only — header and footer keep their
 * normal card styling regardless of media mode. One item fills the whole
 * slot; two sit side by side with a narrow divider between them, each with
 * its own rounded corners rather than one flat rectangle.
 *
 * `blurred` is the "text" mode look: rather than the media disappearing the
 * moment someone reads the full gist, it stays present — heavily blurred and
 * dimmed behind the text — so reading still feels like part of the same
 * photo/video, not a jump to an unrelated screen.
 *
 * Each tile owns its own click — not a single guessed-coordinate layer on
 * top, since that couldn't reliably tell which tile was actually tapped.
 * Images tap-open the overlay directly;
 * videos reassign the tap to mute/pause (see MediaFrame) and get a dedicated
 * expand button instead. Interaction is disabled while `blurred` (text mode
 * already has its own controls on top).
 */
export function GistMediaBackdrop({
  media,
  blurred,
  active = true,
  overlayOpen,
  onTileClick,
  onNext,
  onPrev,
  dragProgress,
  touchSurfaceRef,
}: {
  media: GistMediaType[];
  blurred?: boolean;
  /** False for gists peeking behind the front card — only the actual front
   * card plays video, and peeking tiles aren't interactive yet either. */
  active?: boolean;
  /** True while the bigger overlay is open on this gist — its own video
   * takes over, so the in-card copy has to pause. */
  overlayOpen?: boolean;
  /** Fires with the tapped tile's index — opens the bigger overlay view. */
  onTileClick?: (index: number) => void;
  /** Vertical drag past this (unscrollable) media — see useOverscrollNav —
   * advances/goes back a gist, same gesture as the text cards use once
   * they're scrolled to their own edge. Revealing the caption is tap-only
   * now ("…more"/"Back to media" in GistMediaBodyPanel), so vertical drag
   * on the media itself is free to mean this instead. */
  onNext?: () => void;
  onPrev?: () => void;
  /** GistCard's shared drag-progress motion value, passed straight through
   * from GistStack — this only reads/writes it for the boundary gesture;
   * GistStack is what actually renders it as the whole card's transform. */
  dragProgress: MotionValue<number>;
  /** Same shared touch surface (the whole card frame) as GistCard's own
   * call — see useOverscrollNav's docs. */
  touchSurfaceRef: RefObject<HTMLElement | null>;
}) {
  const items = media.slice(0, 2);
  const isDuo = items.length === 2;
  const interactive = !blurred && active && !overlayOpen;
  // Two-media layout is the only thing that ever differs by breakpoint here
  // — desktop's side-by-side split stays exactly as-is, permanently; mobile
  // gets its own branch below so it can keep changing without touching
  // desktop at all (this used to be one shared layout for both, which is
  // why earlier mobile-only experiments were silently affecting desktop too).
  const isMobile = useIsMobile();

  // Single source of truth for "which tile is playing" — lives here, not
  // per-tile, specifically so pressing play on one can pause the other:
  // never two videos playing (and competing for attention/audio) at once.
  // Starts on the lead tile (0); null means nothing is playing.
  const [playingIndex, setPlayingIndex] = useState<number | null>(0);

  // Resetting to the default (lead plays) when this card stops being the
  // front one — done during render (the documented React pattern for
  // resetting state on a prop change) rather than in an effect, which would
  // set state synchronously after an already-committed render.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setPlayingIndex(0);
  }

  const tile = (item: GistMediaType, idx: number, className: string) => {
    const isVideo = item.media_type?.toLowerCase().includes("video");
    // Images: tapping the tile itself opens the overlay directly — there's
    // no competing "mute" behavior to make room for. Videos: the tap is
    // reassigned to mute-toggle (handled inside MediaFrame), so opening the
    // overlay moves to its own explicit expand button instead.
    return (
      <motion.div
        key={item.media_id}
        className={className}
        onClick={interactive && !isVideo ? () => onTileClick?.(idx) : undefined}
      >
        <MediaFrame
          item={item}
          isLead={idx === 0}
          playing={playingIndex === idx}
          onTogglePlay={() => setPlayingIndex((p) => (p === idx ? null : idx))}
          active={active}
          blurred={blurred}
          overlayOpen={overlayOpen}
          onExpand={interactive ? () => onTileClick?.(idx) : undefined}
        />
      </motion.div>
    );
  };

  // Nothing here ever scrolls (it's media, not text), so useOverscrollNav's
  // "at top/bottom" check is trivially true from the very first pixel of
  // drag — any vertical drag on the media immediately counts as a pull
  // past the edge, exactly like a short hero-text card with nothing to
  // scroll through either.
  const { scrollRef } = useOverscrollNav<HTMLDivElement>({
    surfaceRef: touchSurfaceRef,
    y: dragProgress,
    onNext,
    onPrev,
    enabled: interactive,
  });

  return (
    <div ref={scrollRef} className="absolute inset-0 z-0">
      {isDuo && isMobile ? (
        // Mobile: stacked top/bottom, even 50/50 split — both photos fully
        // visible at once (not a one-at-a-time carousel), and halving the
        // HEIGHT instead of the width keeps each photo's full width, which
        // crops far less of it away on a narrow portrait card than the
        // side-by-side split (still used on desktop) does.
        <div className="flex h-full w-full flex-col gap-1">
          {items.map((item, idx) =>
            tile(item, idx, "relative w-full flex-1 overflow-hidden rounded-2xl border border-black/25 dark:border-white/25"),
          )}
        </div>
      ) : isDuo ? (
        // Desktop: permanent side-by-side split — each tile gets its own
        // full frame, reading as two distinct photos placed side by side
        // rather than one image accidentally split in half by a thin gap.
        <div className="flex h-full w-full gap-1">
          {items.map((item, idx) =>
            tile(item, idx, "relative h-full flex-1 overflow-hidden rounded-2xl border border-black/25 dark:border-white/25"),
          )}
        </div>
      ) : (
        tile(items[0], 0, "relative h-full w-full overflow-hidden rounded-2xl")
      )}
      {blurred && (
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-black/55" />
      )}
    </div>
  );
}

/**
 * The body slot's interaction layer — purely gesture + text, no visual media
 * of its own (that's the backdrop, already showing through underneath, in
 * both modes now). In "media" mode it's a plain caption bar written
 * directly on the media (WhatsApp-status style — no button chrome), a
 * preview of the gist text ending in an "…more" affordance when truncated.
 * Tapping it — tap only, deliberately, not swipe — hands off to "text"
 * mode, which shows the full gist text over the blurred backdrop, with a
 * pill to tap back down to the (now sharp again) photo. Vertical drag past
 * the edge of that full text still means next/prev gist, same as
 * everywhere else (see useOverscrollNav below) — expand/collapse and
 * page-navigation stay on two clearly different gestures instead of both
 * trying to live on "swipe vertically."
 */
export function GistMediaBodyPanel({
  mode,
  onModeChange,
  text,
  onNext,
  onPrev,
  dragProgress,
  touchSurfaceRef,
}: {
  mode: "media" | "text";
  onModeChange: (mode: "media" | "text") => void;
  text: string;
  /** Same next/prev-gist gesture as GistMediaBackdrop, applied to the
   * expanded caption's own scrollable text once it's scrolled to its edge. */
  onNext?: () => void;
  onPrev?: () => void;
  /** Same shared drag-progress motion value as GistMediaBackdrop — see its docs. */
  dragProgress: MotionValue<number>;
  /** Same shared touch surface (the whole card frame) as GistMediaBackdrop's
   * own call — see useOverscrollNav's docs. */
  touchSurfaceRef: RefObject<HTMLElement | null>;
}) {
  const previewChars = usePreviewChars();
  const { preview, truncated } = previewText(text, previewChars);
  const { scrollRef } = useOverscrollNav<HTMLDivElement>({
    surfaceRef: touchSurfaceRef,
    y: dragProgress,
    onNext,
    onPrev,
    enabled: mode === "text",
  });

  return (
    // pointer-events-none only while in "media" mode: a transparent div
    // still captures clicks across its whole box by default, so without
    // this the tiles underneath (which now own tap-to-open) never actually
    // received any clicks — this wrapper was silently eating them first.
    // "text" mode needs normal pointer events (scrollable text, back button).
    <div className={`relative h-full ${mode === "media" ? "pointer-events-none" : ""}`}>
      <AnimatePresence initial={false} mode="wait">
        {mode === "media" ? (
          <motion.div
            key="media"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Only tappable when there's actually more to show — if the
                whole gist already fits in the caption, "text" mode would
                just show the exact same text again, so there's nothing to
                open. Clicks everywhere else pass through (pointer-events-none
                above) to the media tile underneath, which owns its own
                tap-to-open-overlay. */}
            {truncated ? (
              <button
                type="button"
                onClick={() => onModeChange("text")}
                className="pointer-events-auto absolute inset-x-0 bottom-0 line-clamp-2 break-words rounded-2xl bg-black/55 px-4 pb-2.5 pt-3 text-left font-nunito text-sm font-medium leading-snug text-white sm:line-clamp-4 md:line-clamp-3"
              >
                {preview}
                <span className="font-bold text-brand-accent"> …more</span>
              </button>
            ) : (
              <p className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 break-words rounded-2xl bg-black/55 px-4 pb-2.5 pt-3 text-left font-nunito text-sm font-medium leading-snug text-white sm:line-clamp-4 md:line-clamp-3">
                {preview}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="text"
            className="absolute inset-0 flex flex-col"
            initial={{ y: 70, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 70, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pr-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/30"
            >
              <p className="w-full whitespace-pre-wrap break-words font-nunito text-[15px] leading-relaxed text-white text-justify">
                {text}
              </p>
            </div>
            <button
              type="button"
              aria-label="Back to media"
              onClick={() => onModeChange("media")}
              className="mx-auto mb-3 mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm"
            >
              <motion.span
                className="flex"
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
              >
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
