"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { MediaImage, MediaVideo } from "@/components/ui/MediaFrame";
import {
  PlayIconFill,
  PauseIconFill,
  ExpandIconFill,
  VolumeIconFill,
  MuteIconFill,
} from "@/components/ui/icons";
import type { GistMedia } from "@/types";
import { cloudinarySmartCrop, cloudinarySrcSet, cloudinaryFit, cloudinaryFitSrcSet, cloudinaryVideo } from "@/lib/cloudinary";

// Lives here (not in GistCard.tsx, which used to define it) specifically to
// avoid a circular import — GistCard.tsx needs ExpandableText/MediaBlock
// from this file, so this file can't import anything back from GistCard.tsx.
export const SHORT_TEXT = 200;

export const EXTREME_ASPECT_RATIO = 0.45;

/** width/height are only ever present on media uploaded through Cloudinary
 * (see the backend's finalize/upload/create handlers) — null for anything
 * older, or attached by URL rather than uploaded (a GIF/sticker). */
export function knownRatio(item: GistMedia): number | null {
  return typeof item.width === "number" &&
    typeof item.height === "number" &&
    item.height > 0
    ? item.width / item.height
    : null;
}

/**
 * Long text clamps to a handful of lines with a "…more" — tapping it
 * expands in place and stays open (no "show less"), same convention
 * Twitter/Threads use. Shared by the profile page's list rows and the
 * feed's own media-gist caption (text now sits above the media there
 * too, not burned onto it — see GistCard.tsx) — same threshold
 * (SHORT_TEXT) both already use to decide "does this need truncating."
 */
export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = text.length >= SHORT_TEXT;

  return (
    <div className="min-w-0">
      <p
        className={`whitespace-pre-wrap break-words font-nunito text-[15px] leading-relaxed text-ink md:text-lg ${
          needsClamp && !expanded ? "line-clamp-5" : ""
        }`}
      >
        {text}
      </p>
      {needsClamp && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 font-nunito text-[13px] font-bold text-brand-accent md:text-sm"
        >
          …more
        </button>
      )}
    </div>
  );
}

type VideoSyncRef = RefObject<{
  getCurrentTime: () => number;
  seek: (time: number) => void;
} | null>;

// Feed-only (see fitHeightPx below) — how much of the measured available
// space a duo's second tile gets reserved as its visible "peek" before the
// first tile is allowed to use the rest. Enough to clearly read as "there's
// a second photo," not so much it eats into the first one's own space.
const DUO_PEEK_RESERVE_PX = 80;
// Floor under the first tile's fit height even if the caption text ate
// most of the available space — a first photo squashed thinner than this
// reads as broken, not "made room for the text."
const MIN_FIT_HEIGHT_PX = 160;

/**
 * Media, Twitter-style: below the text, not behind it. One item (photo or
 * video) keeps its real proportions. Two behave differently depending on
 * `stackDuo` — see its own doc below.
 */
export function MediaBlock({
  media,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
  active,
  stackDuo,
  fitHeightPx,
}: {
  media: GistMedia[];
  onOpenOverlay: (index: number) => void;
  overlayOpen: boolean;
  videoSyncRef?: VideoSyncRef;
  /** Undefined (the profile grid's own usage) keeps every video tile's
   * existing autoplay-on-scroll-into-view behavior, driven by its own
   * IntersectionObserver — appropriate for a plain scrolling list. Passed
   * explicitly by the feed instead (see GistCard.tsx), where only the
   * front card in the swipe stack should ever be playing — an
   * intersection observer alone can't tell "front card" from "a peeking
   * card that also happens to be partly visible," which is exactly the
   * double-audio bug the feed's stack-driven active prop already exists
   * to prevent everywhere else in that component. */
  active?: boolean;
  /** Feed-only (see GistCard.tsx) — two media items stack vertically
   * instead of being cropped into two equal side-by-side halves. The
   * profile grid doesn't pass this — its rows aren't height-constrained
   * the same way, so the side-by-side crop (still the plainer, more
   * compact look for a scrolling list) stays its default. */
  stackDuo?: boolean;
  /** Feed-only — the real, measured pixel budget left in the card after
   * the caption text above it (see GistCard.tsx's own ResizeObserver-based
   * measurement). Without this, a flat height cap has no way to know how
   * much room the text just used, so a single photo could end up taller
   * than what's actually visible — needing a scroll just to see the rest
   * of the ONE photo there is, which is exactly what this exists to
   * prevent: the first (or only) item always fits fully inside this
   * budget, no scroll required. A duo's second item deliberately does NOT
   * get this treatment — it keeps its old fixed cap and is allowed to
   * spill past the visible edge, which is the whole point of it (a
   * "there's more" peek, not something meant to fit). */
  fitHeightPx?: number;
}) {
  const items = media.slice(0, 2);
  const isDuo = items.length === 2;
  // Only the FIRST tile ever gets a fit-to-budget height — reserving a
  // slice for the second one's peek when there is a second one, otherwise
  // using the whole measured budget for the one photo there is.
  const firstFitHeightPx =
    fitHeightPx !== undefined
      ? Math.max(
          fitHeightPx - (isDuo && stackDuo ? DUO_PEEK_RESERVE_PX : 0),
          MIN_FIT_HEIGHT_PX,
        )
      : undefined;

  return (
    <div
      data-media-block
      className={
        isDuo && stackDuo
          ? "mt-2.5 flex flex-col gap-1.5"
          : `mt-2.5 ${isDuo ? "flex aspect-[4/3] w-full gap-1" : ""}`
      }
    >
      {isDuo && stackDuo ? (
        items.map((item, idx) => (
          <MediaTile
            key={item.media_id}
            item={item}
            cropped={false}
            onOpenOverlay={() => onOpenOverlay(idx)}
            overlayOpen={overlayOpen}
            videoSyncRef={videoSyncRef}
            active={active}
            // Only the first (idx 0) gets a fit height — the second is the
            // deliberate peek, left to its own old fixed-cap sizing.
            fitHeightPx={idx === 0 ? firstFitHeightPx : undefined}
          />
        ))
      ) : isDuo ? (
        items.map((item, idx) => (
          <div
            key={item.media_id}
            className="relative h-full flex-1 overflow-hidden rounded-2xl"
          >
            <MediaTile
              item={item}
              cropped
              onOpenOverlay={() => onOpenOverlay(idx)}
              overlayOpen={overlayOpen}
              videoSyncRef={videoSyncRef}
              active={active}
            />
          </div>
        ))
      ) : (
        <MediaTile
          item={items[0]}
          cropped={false}
          onOpenOverlay={() => onOpenOverlay(0)}
          overlayOpen={overlayOpen}
          videoSyncRef={videoSyncRef}
          active={active}
          fitHeightPx={firstFitHeightPx}
        />
      )}
    </div>
  );
}

function MediaTile({
  item,
  cropped,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
  active,
  fitHeightPx,
}: {
  item: GistMedia;
  cropped: boolean;
  onOpenOverlay: () => void;
  overlayOpen: boolean;
  videoSyncRef?: VideoSyncRef;
  active?: boolean;
  /** See MediaBlock's own doc — a real measured pixel budget this tile is
   * guaranteed to fit fully inside, no cropping, no scroll required to see
   * the rest of it. Takes over sizing entirely when set; the known/extreme
   * cap logic below is what runs when it isn't (Profile's calls, and a
   * duo's second/peek tile, which deliberately keeps the old behavior). */
  fitHeightPx?: number;
}) {
  const isVideo = item.media_type?.toLowerCase().includes("video");
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  // A known ratio decides this immediately, synchronously, correctly —
  // nothing to measure. Only media missing it (see knownRatio) falls back
  // to reading the loaded element itself, which can only ever catch up
  // AFTER the first paint already guessed wrong.
  const extreme =
    known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  if (isVideo) {
    return (
      <VideoTile
        item={item}
        cropped={cropped}
        onOpenOverlay={onOpenOverlay}
        overlayOpen={overlayOpen}
        videoSyncRef={videoSyncRef}
        active={active}
        fitHeightPx={fitHeightPx}
      />
    );
  }

  if (fitHeightPx !== undefined) {
    // cloudinaryFit (not cloudinarySmartCrop) — the whole point here is
    // showing the real, uncropped photo, which means the DELIVERED file
    // itself can't be server-side cropped either (cloudinarySmartCrop's
    // c_fill,ar_4:3 would crop the source before any CSS choice here ever
    // got a say). object-contain + an explicit height (a real BOX, not the
    // image's own natural size) scales the whole photo to fit inside that
    // box without cropping, letterboxed rather than cropped if its ratio
    // doesn't exactly match the box's. bg-brand-ink fills that letterboxed
    // space — near-black so it stays neutral behind whatever's actually in
    // the photo, but with the brand's own navy undertone rather than a flat
    // generic black.
    return (
      <MediaImage
        src={cloudinaryFit(item.media_url)}
        srcSet={cloudinaryFitSrcSet(item.media_url)}
        sizes="(min-width: 768px) 740px, 100vw"
        alt=""
        onClick={onOpenOverlay}
        draggable={false}
        style={{ WebkitUserDrag: "none", height: fitHeightPx } as React.CSSProperties}
        className="block w-full cursor-pointer rounded-2xl bg-brand-ink object-contain"
      />
    );
  }

  return (
    <MediaImage
      src={cloudinarySmartCrop(item.media_url)}
      srcSet={cloudinarySrcSet(item.media_url)}
      // Same real-width cap this tile's column renders at everywhere in the
      // app: max-w-[740px] from md (768px) up, full viewport width below.
      sizes="(min-width: 768px) 740px, 100vw"
      alt=""
      onClick={onOpenOverlay}
      onLoad={
        cropped || known !== null
          ? undefined
          : (e) => {
              const img = e.currentTarget;
              if (img.naturalWidth / img.naturalHeight < EXTREME_ASPECT_RATIO)
                setMeasuredExtreme(true);
            }
      }
      draggable={false}
      // When the real ratio is already known, it drives sizing directly via
      // CSS `aspect-ratio` instead of waiting on the browser to decode the
      // image itself — for a photo that's rarely a visible difference, but
      // using the exact same mechanism VideoTile relies on (see its own
      // note) means one code path, not two subtly different ones.
      style={
        {
          WebkitUserDrag: "none",
          ...(known !== null && !extreme ? { aspectRatio: known } : {}),
        } as React.CSSProperties
      }
      className={
        cropped
          ? "h-full w-full cursor-pointer rounded-2xl object-cover object-top"
          : extreme
            ? "aspect-[3/4] max-h-[420px] w-full cursor-pointer rounded-2xl object-cover object-top"
            : "block w-full max-h-[420px] cursor-pointer rounded-2xl object-cover object-top"
      }
    />
  );
}

/**
 * Tap-to-play with mute/unmute control — a dedicated mute button sits next
 * to the play/pause button. Expand opens the shared GistMediaOverlay.
 *
 * Autoplay has two modes (see `active` on MediaBlock above): with no
 * `active` prop, this tile decides for itself via IntersectionObserver
 * (autoplay/pause as it scrolls in/out of view — the profile grid's own
 * usage). With `active` explicitly passed (the feed), that prop is the
 * only thing that gates playback — no observer at all — since the feed
 * already knows exactly which one card in its swipe stack is the real
 * front one, and an observer can't reliably tell that apart from a
 * partially-visible peeking card.
 */
function VideoTile({
  item,
  cropped,
  onOpenOverlay,
  overlayOpen,
  videoSyncRef,
  active,
  fitHeightPx,
}: {
  item: GistMedia;
  cropped: boolean;
  onOpenOverlay: () => void;
  overlayOpen: boolean;
  videoSyncRef?: VideoSyncRef;
  active?: boolean;
  /** See MediaTile's own doc — same deal, minus the server-side-crop
   * concern images have (cloudinaryVideo negotiates codec, not crop, so
   * there's no separate "already cropped" URL to worry about here). */
  fitHeightPx?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Local "did I tap play" intent — combined with `active` (when the
  // caller passes it) to decide real playback below.
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const known = knownRatio(item);
  const [measuredExtreme, setMeasuredExtreme] = useState(false);
  const extreme =
    known !== null ? known < EXTREME_ASPECT_RATIO : measuredExtreme;

  const stackDriven = active !== undefined;
  const shouldPlay = stackDriven ? active && playing : playing;

  // Populate the sync ref so a caller can read the current playback
  // position when opening the overlay and seek the in-card video when the
  // overlay closes — seamless handoff. No-ops entirely when nobody passed
  // one (the feed's own usage today).
  useEffect(() => {
    if (!videoSyncRef) return;
    videoSyncRef.current = {
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      seek: (time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
      },
    };
    return () => {
      videoSyncRef.current = null;
    };
  }, [videoSyncRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) video.play().catch(() => {});
    else video.pause();
  }, [shouldPlay]);

  // Pause the in-card video when the overlay opens — two copies of the
  // same video (and audio) playing at once makes no sense. The overlay's
  // own video takes over; when it closes, the in-card video stays paused
  // until the user taps play again (or, in stack-driven mode, until this
  // card becomes active again and playing is re-armed). Reset-during-render
  // (not an effect) — same pattern as `prevActive` below.
  const [prevOverlayOpen, setPrevOverlayOpen] = useState(overlayOpen);
  if (overlayOpen !== prevOverlayOpen) {
    setPrevOverlayOpen(overlayOpen);
    if (overlayOpen) setPlaying(false);
  }

  // Stack-driven mode: reset to "not playing" the moment this card stops
  // being the active one, so it doesn't silently resume (still muted-off,
  // stale `playing=true`) the next time it becomes active again without
  // the user having actually pressed play that time. Mirrors the same
  // reset-during-render pattern this file's own MediaBlock-level active
  // reset (see the profile-grid-vs-feed comment above) mirrors.
  const [prevActive, setPrevActive] = useState(active);
  if (stackDriven && active !== prevActive) {
    setPrevActive(active);
    if (!active) setPlaying(false);
  }

  // Autoplay-on-scroll-into-view — ONLY when nobody's telling this tile
  // what to do via `active` (the profile grid's own case). See this
  // component's own docstring for why the feed can't share this.
  useEffect(() => {
    if (stackDriven) return;
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setPlaying(!!entries[0]?.isIntersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [stackDriven]);

  const canControl = stackDriven ? !!active && !overlayOpen : !overlayOpen;

  return (
    <div
      style={
        fitHeightPx !== undefined
          ? { height: fitHeightPx }
          : known !== null && !cropped && !extreme
            ? { aspectRatio: known }
            : undefined
      }
      className={
        fitHeightPx !== undefined
          ? "relative w-full"
          : cropped
            ? "relative h-full w-full"
            : extreme
              ? "relative aspect-[3/4] max-h-[420px] w-full"
              : "relative w-full max-h-[420px]"
      }
      onClick={canControl ? () => setPlaying((p) => !p) : undefined}
    >
      <MediaVideo
        ref={videoRef}
        src={cloudinaryVideo(item.media_url)}
        poster={item.thumbnail_url}
        playsInline
        loop
        muted={muted}
        // Belt-and-suspenders for media that DOES have a known ratio (the
        // wrapper's own aspect-ratio above already sizes it correctly
        // regardless), and the only thing that helps at all for media that
        // doesn't: a <video> with a poster but no explicit preload defers
        // fetching its real dimensions until playback actually starts on
        // most browsers, which is what made an old, dimension-less tile
        // visibly resize the moment someone hit play.
        preload="metadata"
        onLoadedMetadata={
          fitHeightPx !== undefined || cropped || known !== null
            ? undefined
            : (e) => {
                const video = e.currentTarget;
                if (video.videoWidth / video.videoHeight < EXTREME_ASPECT_RATIO)
                  setMeasuredExtreme(true);
              }
        }
        className={
          fitHeightPx !== undefined
            ? "h-full w-full rounded-2xl bg-brand-ink object-contain"
            : "h-full w-full rounded-2xl object-cover object-top"
        }
      />
      {canControl && (
        <>
          <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPlaying((p) => !p);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              {playing ? (
                <PauseIconFill className="h-4 w-4" weight="fill" />
              ) : (
                <PlayIconFill className="h-4 w-4" weight="fill" />
              )}
            </button>
            <button
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              {muted ? (
                <MuteIconFill className="h-4 w-4" weight="fill" />
              ) : (
                <VolumeIconFill className="h-4 w-4" weight="fill" />
              )}
            </button>
          </div>
          <button
            type="button"
            aria-label="Expand"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenOverlay();
            }}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            <ExpandIconFill className="h-4 w-4" weight="duotone" />
          </button>
        </>
      )}
    </div>
  );
}
