"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MediaImage, MediaVideo } from "@/components/ui/MediaFrame";
import {
  PlayIconFill,
  PauseIconFill,
  ExpandIconFill,
  VolumeIconFill,
  MuteIconFill,
} from "@/components/ui/icons";
import type { GistMedia } from "@/types";
import { cloudinaryFit, cloudinaryFitSrcSet, cloudinaryVideo } from "@/lib/cloudinary";
import { useVideoSoundStore } from "@/stores/videoSoundStore";
import { useAnyModalOpen } from "@/stores/modalStore";

// Lives here (not in GistCard.tsx, which used to define it) specifically to
// avoid a circular import — GistCard.tsx needs ExpandableText/MediaBlock
// from this file, so this file can't import anything back from GistCard.tsx.
export const SHORT_TEXT = 200;

/** How much of the viewport height a single piece of media (or a justified
 * row of two) is ever allowed to claim — the one ceiling standing in for
 * the old fixed 420px cap. Viewport-relative rather than a flat pixel
 * number so "reasonable" scales with the actual screen, not a desktop-sized
 * guess that's way too generous on a phone and way too tight on a monitor.
 * Expressed as a literal Tailwind class (`max-h-[75vh]`) wherever it's
 * used, not interpolated from this constant — Tailwind only generates CSS
 * for arbitrary values it can see as a literal string at build time. */
const MEDIA_HEIGHT_CEILING = "75vh";

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

// How long a single tap on media waits before committing to its own normal
// action, in case a second tap is about to arrive — same window every
// double-tap-to-react card already uses (see FeedGistCard/ProfileGistCard/
// GistCard's own handleDoubleTapReact), just enforced here as an actual
// delay instead of a look-back check, since media's own single tap (open
// overlay / toggle play) has to be held off long enough to still be
// cancellable, not just detected after the fact.
const MEDIA_TAP_DELAY_MS = 280;

/**
 * Distinguishes a single tap on a photo/video from the first half of a
 * double-tap, without a gesture library. The outer cards' own
 * handleDoubleTapReact deliberately excludes anything inside
 * `[data-media-block]` (see their own docs) precisely because media has
 * its own single-tap meaning (open the overlay, toggle play/pause) that a
 * plain "was the last tap under 300ms ago" check can't coexist with — that
 * pattern only ever WATCHES taps, it doesn't own deciding whether the
 * tapped element's normal action should even run.
 *
 * So this owns both sides at once: a tap starts a timer for `onSingleTap`;
 * if nothing else happens, that timer fires and the tile does its normal
 * thing exactly as before. If a SECOND tap lands before the timer does,
 * the timer is cancelled — the normal action never runs at all — and
 * `onDoubleTap` fires instead. That's the real reason a genuine single tap
 * on media now has a small, deliberate delay before its own effect shows:
 * without holding it back for the full window, there'd be nothing left to
 * cancel by the time a second tap confirmed itself.
 */
function useDelayedTapAction(onSingleTap: () => void, onDoubleTap?: () => void) {
  const timerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );
  return () => {
    const now = Date.now();
    if (now - lastTapRef.current < MEDIA_TAP_DELAY_MS) {
      lastTapRef.current = 0;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onDoubleTap?.();
      return;
    }
    lastTapRef.current = now;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onSingleTap();
    }, MEDIA_TAP_DELAY_MS);
  };
}

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
  onDoubleTapReact,
}: {
  media: GistMedia[];
  onOpenOverlay: (index: number) => void;
  overlayOpen: boolean;
  videoSyncRef?: VideoSyncRef;
  /** Fires on a double-tap anywhere on a tile's media — the same LOVE
   * reaction any double-tap elsewhere on the card already triggers (see
   * FeedGistCard/ProfileGistCard/GistCard's own handleDoubleTapReact),
   * just reachable from inside the media itself now too. Undefined skips
   * double-tap detection entirely and restores the old immediate
   * single-tap behavior — used by QuotedGistBody's read-only preview of a
   * repost's quoted gist, which was never wired to any card's own
   * reaction state and shouldn't start being now. */
  onDoubleTapReact?: () => void;
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
  // Any dialog/sheet built on the shared Modal component (see its own
  // doc) — a video autoplaying via IntersectionObserver or the stack's
  // `active` prop has no idea one just opened on top of it, since
  // neither signal accounts for actual visual occlusion, only geometric
  // viewport intersection / "is this the front card." OR'd into every
  // MediaTile's own forcePause below, same prop the duo mutual-exclusion
  // logic already uses for the identical "something external says stop"
  // purpose.
  const anyModalOpen = useAnyModalOpen();
  const items = media.slice(0, 2);
  const isDuo = items.length === 2;
  // Justified-row sizing for a plain (non-stackDuo) duo — see the render
  // branch below. Each tile's width ends up proportional to its own real
  // aspect ratio at one shared row height, instead of forcing both into
  // equal cropped halves. Defaults to a plain guess (1, i.e. square) for
  // whichever item has no stored width/height (a GIF/sticker attached by
  // URL, or an older pre-migration upload) — the vast majority of uploads
  // do have one. That guess self-corrects the moment the real element
  // loads and reports back via a tile's own onMeasuredRatio, same "known
  // decides immediately, unknown measures and corrects after" pattern this
  // file already uses elsewhere. Reset (not just initialized) whenever
  // `media` itself changes identity — an edit can swap in a whole new
  // media array, and a stale ratio from the PREVIOUS gist's photos would
  // otherwise size this one's row wrong until something happened to
  // re-trigger a measurement.
  const [duoRatios, setDuoRatios] = useState<[number, number]>(() => [
    knownRatio(items[0]) ?? 1,
    isDuo ? knownRatio(items[1]) ?? 1 : 1,
  ]);
  const [prevMedia, setPrevMedia] = useState(media);
  if (media !== prevMedia) {
    setPrevMedia(media);
    setDuoRatios([knownRatio(items[0]) ?? 1, isDuo ? knownRatio(items[1]) ?? 1 : 1]);
  }
  // Which of the two tiles (by index) is the one currently allowed to
  // play — only meaningful when both are videos. Owned here, not inside
  // either VideoTile, because the two tiles are siblings with no other
  // way to know about each other; MediaBlock is the one place that
  // already renders both. A tile claims this (see VideoTile's own
  // `onRequestPlay`) the instant IT starts playing — whether that's the
  // first tile autoplaying, or a manual tap on either one — which is what
  // makes tapping the second video while the first is already playing
  // pause the first, and vice versa, instead of both playing at once.
  const [activePlayIdx, setActivePlayIdx] = useState<number | null>(null);
  // Stable identity across renders — VideoTile's own claim effect depends
  // on this, and an inline closure recreated on every MediaBlock render
  // would retrigger that effect every time too (harmless in the end
  // since it'd just re-set the same idx, but needless churn — same
  // "don't hand a memoized child a fresh callback every render" reasoning
  // GistStack's own handleOverlayOpenChange is built around).
  const handleRequestPlay0 = useCallback(() => setActivePlayIdx(0), []);
  const handleRequestPlay1 = useCallback(() => setActivePlayIdx(1), []);
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
      className={`mt-2.5 ${isDuo && stackDuo ? "flex flex-col gap-1.5" : ""}`}
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
            // The second tile still keeps its own flat-cap peek sizing
            // (see fitHeightPx above), but shows the real, uncropped shape
            // now too — matching the first tile's contain treatment
            // instead of the cropped "teaser" look it used to have.
            contain={idx === 1}
            // If BOTH items happen to be videos, only the first (the real
            // content, not the peek) should ever autoplay — see VideoTile's
            // own doc on `autoplay` for why a second one auto-starting too
            // is exactly the double-audio problem this file already
            // guards against elsewhere. Still fully tappable either way —
            // this only gates the automatic start, not manual play.
            autoplay={idx === 0}
            // Mutual exclusion for a manual tap — see activePlayIdx above.
            forcePause={anyModalOpen || (activePlayIdx !== null && activePlayIdx !== idx)}
            onRequestPlay={idx === 0 ? handleRequestPlay0 : handleRequestPlay1}
            onDoubleTapReact={onDoubleTapReact}
          />
        ))
      ) : isDuo ? (
        // Justified row: one shared height (the row's own aspect-ratio,
        // derived from BOTH items' combined ratio, capped the same way a
        // single item is) with each tile's width left to flex-grow in
        // proportion to its own ratio — see MediaTile's own `cropped`
        // branch for the actual split. Neither tile forces the other into
        // an unrelated shape the way the old flat 4:3-split crop did.
        <div
          // Mobile: forced w-full, exactly like before — always fills the
          // card, never shrinks. md+ (desktop) only: max-w-full (a ceiling,
          // not a mandate) lets the row's width shrink back down together
          // with a maxHeight-clamped height, so a tall duo's row keeps its
          // two real photos' combined shape instead of object-cover
          // cropping the mismatch away. Desktop-only because a forced
          // width is what's needed for this row to reliably fill the card
          // at all on mobile — see MediaTile's own doc on the same
          // md:w-auto/md:max-w-full split. mx-auto centers it for when it
          // actually does shrink narrower than the column.
          className="flex w-full gap-1 md:mx-auto md:w-auto md:max-w-full"
          style={{ aspectRatio: duoRatios[0] + duoRatios[1], maxHeight: MEDIA_HEIGHT_CEILING }}
        >
          {items.map((item, idx) => (
            <MediaTile
              key={item.media_id}
              item={item}
              cropped
              flexGrow={duoRatios[idx]}
              onMeasuredRatio={
                knownRatio(item) === null
                  ? (ratio) =>
                      setDuoRatios((prev) => {
                        if (prev[idx] === ratio) return prev;
                        const next: [number, number] = [...prev];
                        next[idx] = ratio;
                        return next;
                      })
                  : undefined
              }
              onOpenOverlay={() => onOpenOverlay(idx)}
              overlayOpen={overlayOpen}
              videoSyncRef={videoSyncRef}
              active={active}
              autoplay={idx === 0}
              forcePause={anyModalOpen || (activePlayIdx !== null && activePlayIdx !== idx)}
              onRequestPlay={idx === 0 ? handleRequestPlay0 : handleRequestPlay1}
              onDoubleTapReact={onDoubleTapReact}
            />
          ))}
        </div>
      ) : (
        <MediaTile
          item={items[0]}
          cropped={false}
          onOpenOverlay={() => onOpenOverlay(0)}
          overlayOpen={overlayOpen}
          videoSyncRef={videoSyncRef}
          active={active}
          fitHeightPx={firstFitHeightPx}
          forcePause={anyModalOpen}
          onDoubleTapReact={onDoubleTapReact}
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
  contain = false,
  flexGrow,
  onMeasuredRatio,
  autoplay = true,
  forcePause = false,
  onRequestPlay,
  onDoubleTapReact,
}: {
  item: GistMedia;
  cropped: boolean;
  onOpenOverlay: () => void;
  overlayOpen: boolean;
  videoSyncRef?: VideoSyncRef;
  active?: boolean;
  /** See MediaBlock's own doc — a real measured pixel budget this tile is
   * guaranteed to fit fully inside, no cropping, no scroll required to see
   * the rest of it. Takes over sizing entirely when set; the cap logic
   * below is what runs when it isn't (Profile/feed's own single-media and
   * justified-duo calls, and a stackDuo second/peek tile, which
   * deliberately keeps the old behavior). */
  fitHeightPx?: number;
  /** Only meaningful when fitHeightPx is undefined (fitHeightPx already
   * always implies contain) — shows the real, uncropped shape within the
   * tile's existing flat-cap sizing instead of the default cover-crop,
   * same letterbox treatment (bg-brand-ink) as the fitHeightPx path.
   * Feed-only (see MediaBlock's stackDuo second-tile call), never set for
   * the profile grid's own tiles. */
  contain?: boolean;
  /** Justified-row duo only (see MediaBlock's own `cropped` branch) — this
   * tile's share of the row's width, proportional to its own real aspect
   * ratio (or a plain guess until `onMeasuredRatio` corrects it). Ignored
   * everywhere else. */
  flexGrow?: number;
  /** Justified-row duo only — fires once, the moment this tile's real
   * dimensions are known (immediately from stored width/height, or after
   * the element itself loads when there's nothing stored), so MediaBlock
   * can correct both this tile's own flexGrow and the row's shared
   * aspect-ratio away from the plain square guess they started with. */
  onMeasuredRatio?: (ratio: number) => void;
  /** Video-only (see VideoTile's own doc) — whether THIS tile is allowed
   * to auto-start when its card becomes active. Defaults true (single-item
   * gists, profile grid); MediaBlock explicitly sets this false on a duo's
   * second item so two videos in one gist never both start playing (and
   * playing audio) at once — the second stays fully tappable, it just
   * doesn't start on its own. */
  autoplay?: boolean;
  /** Video-only (see VideoTile's own doc) — MediaBlock sets this true on
   * whichever duo tile ISN'T the one currently claimed as playing, so a
   * manual tap on one video always pauses the other, not just autoplay. */
  forcePause?: boolean;
  /** Video-only — called the instant this tile starts playing (autoplay
   * OR a manual tap), so MediaBlock can record it as the one duo tile
   * allowed to play and force the sibling to pause. */
  onRequestPlay?: () => void;
  /** See MediaBlock's own doc. */
  onDoubleTapReact?: () => void;
}) {
  const isVideo = item.media_type?.toLowerCase().includes("video");
  const known = knownRatio(item);
  const handleImageTap = useDelayedTapAction(onOpenOverlay, onDoubleTapReact);

  if (isVideo) {
    return (
      <VideoTile
        item={item}
        cropped={cropped}
        onOpenOverlay={onOpenOverlay}
        overlayOpen={overlayOpen}
        videoSyncRef={videoSyncRef}
        active={active}
        autoplay={autoplay}
        forcePause={forcePause}
        onRequestPlay={onRequestPlay}
        fitHeightPx={fitHeightPx}
        contain={contain}
        flexGrow={flexGrow}
        onMeasuredRatio={onMeasuredRatio}
        onDoubleTapReact={onDoubleTapReact}
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
        onClick={handleImageTap}
        draggable={false}
        style={{ WebkitUserDrag: "none", height: fitHeightPx } as React.CSSProperties}
        className="block w-full cursor-pointer rounded-2xl bg-brand-ink object-contain"
      />
    );
  }

  if (cropped) {
    // Justified-row duo tile — the row (see MediaBlock) already fixes this
    // tile's HEIGHT at 100%; flexGrow (proportional to this tile's own
    // ratio) is what splits the row's WIDTH between it and its sibling, so
    // neither one gets forced into a shape that isn't its own. No
    // aspect-ratio style needed here — width falls out of flexGrow, not a
    // fixed box this image has to match. cloudinaryFit (not
    // cloudinarySmartCrop) delivers the real, uncropped photo, same
    // reasoning as the `contain`/fitHeightPx branches below — the CSS
    // crop here (object-cover, only actually cropping in the rare case the
    // row's own height got capped, see the MEDIA_HEIGHT_CEILING doc) needs
    // the real photo to crop from, not one the server already cropped to a
    // DIFFERENT box. object-center, not object-top — any crop here is
    // left/right (the row ran out of width at its capped height), not
    // top/bottom, so there's no "keep the top" reasoning to preserve.
    return (
      <MediaImage
        src={cloudinaryFit(item.media_url)}
        srcSet={cloudinaryFitSrcSet(item.media_url)}
        sizes="(min-width: 768px) 740px, 100vw"
        alt=""
        onClick={handleImageTap}
        onLoad={
          onMeasuredRatio
            ? (e) => {
                const img = e.currentTarget;
                if (img.naturalHeight > 0) onMeasuredRatio(img.naturalWidth / img.naturalHeight);
              }
            : undefined
        }
        draggable={false}
        style={{ WebkitUserDrag: "none", flexGrow: flexGrow ?? 1, flexBasis: 0 } as React.CSSProperties}
        className="h-full min-w-0 cursor-pointer rounded-2xl object-cover object-center"
      />
    );
  }

  // contain (only reachable when fitHeightPx is undefined — that path
  // above already always shows the real shape) swaps in the same
  // non-cropping source transform and letterbox fill as the fitHeightPx
  // branch. It renders at its own real size for any normal photo, height
  // following naturally, only actually capping the rare case that would
  // otherwise run arbitrarily long. On a shorter screen a normal photo can
  // still genuinely run past the card's own visible edge, same as long
  // text already can — that overflow is exactly the "there's a second one
  // here" peek, revealed in full by scrolling rather than artificially
  // shrunk to fit inside a fixed box. See MediaTile's own doc on `contain`.
  //
  // The default (single-media) branch below is the same idea minus the
  // letterbox: real size, capped the same generous way, but object-cover
  // rather than object-contain — since the box is sized to the photo's own
  // ratio via `aspectRatio` below, there's normally nothing left over to
  // crop either way; object-cover only actually does anything once the
  // cap itself kicks in (see MEDIA_HEIGHT_CEILING's own doc), same
  // reasoning and same rare-edge-case tradeoff as the justified duo above.
  // object-top (not object-center, unlike the duo above) — any crop here
  // is top/bottom, and the subject of a photo is more often framed near
  // the top than dead center. cloudinaryFit here too, same reasoning as
  // `contain`/the duo above — cloudinarySmartCrop's server-side c_fill
  // would force every photo into a flat 4:3 box before any of this box
  // sizing ever got a say, the exact thing this whole change exists to
  // stop doing.
  return (
    <MediaImage
      src={cloudinaryFit(item.media_url)}
      srcSet={cloudinaryFitSrcSet(item.media_url)}
      // Same real-width cap this tile's column renders at everywhere in the
      // app: max-w-[740px] from md (768px) up, full viewport width below.
      sizes="(min-width: 768px) 740px, 100vw"
      alt=""
      onClick={handleImageTap}
      draggable={false}
      style={
        {
          WebkitUserDrag: "none",
          ...(known !== null ? { aspectRatio: known } : {}),
        } as React.CSSProperties
      }
      // Mobile: forced w-full, exactly like before — always fills the
      // card, never shrinks. md+ (desktop) only: md:w-auto/md:max-w-full
      // lets the box shrink back down together with a maxHeight-clamped
      // height, so it keeps the photo's real shape instead of object-cover
      // cropping the mismatch away. Desktop-only specifically because a
      // forced width is what's needed for this to reliably fill the card
      // at all on mobile — an unforced width doesn't reliably do that for
      // a plain <img>/<video>, which is exactly what broke mobile the
      // first time this was tried unscoped. md:mx-auto centers it for the
      // rare case it actually does end up narrower than the column.
      className={
        contain
          ? "block w-full max-h-screen cursor-pointer rounded-2xl bg-brand-ink object-contain object-top md:mx-auto md:w-auto md:max-w-full"
          : "block w-full max-h-[75vh] cursor-pointer rounded-2xl object-cover object-top md:mx-auto md:w-auto md:max-w-full"
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
  contain = false,
  flexGrow,
  onMeasuredRatio,
  autoplay = true,
  forcePause = false,
  onRequestPlay,
  onDoubleTapReact,
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
  /** See MediaTile's own doc — only meaningful when fitHeightPx is
   * undefined. */
  contain?: boolean;
  /** See MediaTile's own doc. */
  flexGrow?: number;
  /** See MediaTile's own doc. */
  onMeasuredRatio?: (ratio: number) => void;
  /** Whether THIS tile is allowed to auto-start when `active` becomes
   * true — see MediaTile's own doc. Purely gates the two automatic-start
   * spots below (initial mount, becoming active later); manual tap-to-
   * play/pause (`canControl`/`shouldPlay`) is untouched by this and stays
   * governed by `active` alone, same as before. */
  autoplay?: boolean;
  /** See MediaTile's own doc — set by MediaBlock when a SIBLING duo tile
   * is the one currently claimed as playing. Unlike `autoplay`, this DOES
   * reach manual tap-to-play too (via `shouldPlay` below) — the whole
   * point is that tapping the other video should win, pausing this one,
   * not just suppress this one's own automatic start. */
  forcePause?: boolean;
  /** See MediaTile's own doc. */
  onRequestPlay?: () => void;
  /** See MediaBlock's own doc. */
  onDoubleTapReact?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The intersection-observer effect's own last reading — a ref, not
  // state, purely so the forcePause-clearing branch above can consult
  // "was this tile in view right now" without retriggering a render of
  // its own just to track it. See that branch's own doc for why this
  // exists (the observer itself won't fire again just because forcePause
  // changed, so there's no other way to answer this after the fact).
  const isIntersectingRef = useRef(false);
  // Local play/pause intent — combined with `active` (when the caller
  // passes it) to decide real playback below. Starts true when this tile
  // is already the active front card at mount AND allowed to autoplay
  // (the very first gist the feed opens on, or the first of a duo) — see
  // the `prevActive` effect below for the same autoplay applied every
  // time a card BECOMES active later (swiping to it), not just this
  // initial-mount case.
  const [playing, setPlaying] = useState(() => autoplay && active === true);
  // One shared sound switch for every video, not a per-tile setting — see
  // useVideoSoundStore's own doc. Unmuting any video (anywhere — this gist,
  // a different one, the duo sibling next to it) unmutes this one too the
  // next time it plays, and muting any one mutes all of them back — no
  // separate unmute tap needed per video as you keep scrolling.
  const muted = useVideoSoundStore((s) => s.muted);
  const setMuted = useVideoSoundStore((s) => s.setMuted);
  const known = knownRatio(item);

  const stackDriven = active !== undefined;
  const shouldPlay = (stackDriven ? active && playing : playing) && !forcePause;

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

  // Stack-driven mode: pause the moment this card stops being the active
  // one (so it doesn't keep playing — and its audio, once unmuted, keep
  // going — silently in the background once swiped away from), and
  // (re)start the moment it becomes the active one AND this tile is
  // allowed to autoplay, matching the TikTok/Reels-style feed convention:
  // whichever card is currently front and center always plays, muted,
  // with no tap required — a tap only ever unmutes or explicitly pauses
  // it, same as before. This re-fires on every single swipe onto a video
  // gist, not just the very first one. The `autoplay` gate is what keeps
  // a duo's second video from auto-starting alongside the first — see
  // MediaTile's own doc; it stays fully tappable either way, it just
  // never starts on its own.
  const [prevActive, setPrevActive] = useState(active);
  if (stackDriven && active !== prevActive) {
    setPrevActive(active);
    if (!active) setPlaying(false);
    else if (autoplay) setPlaying(true);
  }

  // Mutual exclusion between a duo's two tiles (see MediaBlock's own
  // activePlayIdx/forcePause docs) — reset THIS tile's own local intent
  // back to false the moment a sibling claims playback, not just
  // `shouldPlay` (which already stops the actual <video> via the effect
  // below regardless). Without this, `playing` would stay stuck at `true`
  // internally while only visually paused, so tapping this tile again
  // afterward would toggle it to `false` (since it "thinks" it's still
  // playing) instead of resuming it — a confusing "first tap does
  // nothing, second tap plays" bug. Reset-during-render, same pattern as
  // `prevOverlayOpen`/`prevActive` above.
  const [prevForcePause, setPrevForcePause] = useState(forcePause);
  if (forcePause !== prevForcePause) {
    setPrevForcePause(forcePause);
    if (forcePause) {
      setPlaying(false);
    } else if (!overlayOpen) {
      // The other half — forcePause clearing (a modal that was covering
      // this tile just closed; see modalStore's own doc) doesn't mean
      // "start playing," it means "stop vetoing whatever this tile's OWN
      // signal already says." In stack-driven mode that's `active`
      // (mirrors the becomes-active branch above); otherwise it's the
      // intersection observer below, which won't fire again on its own
      // since the video never actually left the viewport — only ITS
      // visibility changes trigger a new observer callback, and being
      // covered by a modal was never a visibility change as far as it's
      // concerned. isIntersectingRef is that observer's own last known
      // reading, kept for exactly this. Skipped while overlayOpen is
      // still true — that one's deliberately "stays paused until tapped
      // again" (see its own doc above), forcePause clearing shouldn't
      // override that.
      if (stackDriven ? active && autoplay : autoplay && isIntersectingRef.current) {
        setPlaying(true);
      }
    }
  }

  // The other half of the same mechanism: claim this tile as the active
  // one the instant it actually starts playing, for ANY reason — a manual
  // tap (either tap target below just calls setPlaying, nothing else
  // needed) or an automatic start (the two effects above/below). Keyed on
  // `playing` alone, deliberately NOT `shouldPlay` — `shouldPlay` already
  // factors in `forcePause`, so gating the claim on it too would deadlock:
  // this tile could never claim itself away from a sibling that's already
  // forcing it paused, since it'd never be allowed to actually play in
  // order to claim in the first place. Claiming on raw intent instead lets
  // a tap "win" immediately, which is what flips forcePause on the OTHER
  // tile and lets THIS one actually start on the very next render.
  useEffect(() => {
    if (playing) onRequestPlay?.();
  }, [playing, onRequestPlay]);

  // Autoplay-on-scroll-into-view — ONLY when nobody's telling this tile
  // what to do via `active` (the profile grid's own case). See this
  // component's own docstring for why the feed can't share this.
  //
  // Also skipped when `autoplay` is false — same reasoning as the
  // stack-driven branch above: a duo's second video is a whole separate
  // tile with its OWN independent observer watching its OWN visibility, so
  // without this it could easily cross the 50% threshold at the same
  // moment as the first tile (they're right next to each other) and start
  // itself up too — two videos (and, once either gets unmuted, two audio
  // tracks) playing at once. Manual tap-to-play is untouched; this only
  // stops it from starting on its own.
  useEffect(() => {
    if (stackDriven || !autoplay) return;
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = !!entries[0]?.isIntersecting;
        isIntersectingRef.current = intersecting;
        setPlaying(intersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [stackDriven, autoplay]);

  const canControl = stackDriven ? !!active && !overlayOpen : !overlayOpen;
  const handleVideoTap = useDelayedTapAction(() => setPlaying((p) => !p), onDoubleTapReact);

  return (
    <div
      style={
        fitHeightPx !== undefined
          ? { height: fitHeightPx }
          : cropped
            ? { flexGrow: flexGrow ?? 1, flexBasis: 0 }
            : known !== null
              ? { aspectRatio: known }
              : undefined
      }
      // Mobile: forced w-full on every branch, exactly like before — always
      // fills the card, never shrinks. md+ (desktop) only, on the contain/
      // default branches: md:w-auto/md:max-w-full lets the box shrink back
      // down together with a maxHeight-clamped height, so a tall portrait
      // video keeps its real shape instead of object-cover cropping the
      // mismatch away — same reasoning and same desktop-only scoping as
      // the image tiles above. md:mx-auto centers it for the rare case it
      // actually ends up narrower than the column.
      className={
        fitHeightPx !== undefined
          ? "relative w-full"
          : contain
            ? "relative w-full max-h-screen md:mx-auto md:w-auto md:max-w-full"
            : cropped
              ? "relative h-full min-w-0"
              : "relative w-full max-h-[75vh] md:mx-auto md:w-auto md:max-w-full"
      }
      onClick={canControl ? handleVideoTap : undefined}
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
          onMeasuredRatio
            ? (e) => {
                const video = e.currentTarget;
                if (video.videoHeight > 0) onMeasuredRatio(video.videoWidth / video.videoHeight);
              }
            : undefined
        }
        className={
          fitHeightPx !== undefined || contain
            ? "h-full w-full rounded-2xl bg-brand-ink object-contain"
            : cropped
              ? "h-full w-full rounded-2xl object-cover object-center"
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
                setMuted(!muted);
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
