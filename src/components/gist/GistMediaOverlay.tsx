"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  PlayIconFill,
  PauseIconFill,
  VolumeIconFill,
  MuteIconFill,
} from "@/components/ui/icons";
import type { GistMedia as GistMediaType } from "@/types";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const chromeButton =
  "flex items-center justify-center rounded-full bg-white/10 text-white shadow-lg shadow-black/40 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-white/20 active:scale-95";

/**
 * The bigger, deliberate media view — separate from the swipe-up-for-text
 * gesture on the card (that surface is already spoken for). On desktop this
 * only covers the feed column, not the comment panel on the right (hence
 * `md:right-[360px]` — matches the comment panel's fixed width in
 * feed/page.tsx; there's no shared layout constant for it yet, so this is a
 * loose coupling to keep an eye on if that width ever changes). On mobile
 * there's no side panel to preserve, so it's simply full-screen there.
 *
 * The media sits in its own dedicated "stage" with generous top/bottom
 * clearance — the close button and nav arrows live in that clearance, not
 * floating directly on top of the media itself, so a wide/landscape image or
 * video never crowds right up against the chrome.
 *
 * Deliberately minimal: just the media, close/nav buttons, and — for video —
 * a custom play/pause + scrub + mute bar (not native browser `controls`).
 * No poster identity or engagement details here; this view is purely about
 * the media itself.
 *
 * Rendered via a portal to `document.body` — GistStack animates each card
 * with a Framer Motion `transform` (x/y/rotate/scale), and a `transform` on
 * an ancestor makes it the containing block for `position: fixed`
 * descendants. Without the portal this would be trapped inside the card's
 * own animated box instead of actually covering the viewport.
 */
export function GistMediaOverlay({
  media,
  startIndex,
  onClose,
}: {
  media: GistMediaType[];
  startIndex: number;
  onClose: () => void;
}) {
  const items = media.slice(0, 2);
  const [index, setIndex] = useState(startIndex);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Playback state for whichever item is current — reset when the index
  // changes (adjusting state during render, the documented React pattern,
  // rather than in an effect) since switching items means a different video
  // entirely, not a continuation of the last one's progress.
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    setPlaying(true);
    setMuted(false);
    setCurrentTime(0);
    setDuration(0);
  }

  // Clamped, not wrapped — with only ever 2 items, "wrapping" from the last
  // back to the first (or vice versa) isn't a real "next", it's a no-op that
  // looks like a bug. The first item has nothing before it, the last has
  // nothing after — so those arrows just shouldn't exist.
  const go = (delta: number) => {
    setIndex((i) => Math.min(Math.max(i + delta, 0), items.length - 1));
  };
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 && hasNext) go(1);
    else if (info.offset.x > 80 && hasPrev) go(-1);
  };

  // Owns its own keyboard handling entirely independently of the gist stack
  // underneath — GistStack's own arrow-key handler no-ops while this is
  // open (see its overlayOpenRef), so there's no fight over the same keys:
  // while the overlay is up, arrows move between its media, not gists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The comment panel (still visible/usable on desktop while the
      // overlay is open) has its own text input — arrow keys there should
      // move the text cursor, not silently swap media in the background.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && hasNext) go(1);
      else if (e.key === "ArrowLeft" && hasPrev) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, hasPrev, onClose]);

  const current = items[index];
  const isVideo = current.media_type?.toLowerCase().includes("video");

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const onSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const t = Number(e.target.value);
    if (v) v.currentTime = t;
    setCurrentTime(t);
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 md:right-[360px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Close — its own dedicated top-right corner, clear of the media
          stage's bounds (which starts well below/inset of this). */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`${chromeButton} absolute right-4 top-4 z-20 h-10 w-10 sm:right-6 sm:top-6`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Nav arrows — vertically centered on the viewport, well outside the
          media stage's own side padding so they never crowd a wide image. */}
      {hasPrev && (
        <button
          type="button"
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className={`${chromeButton} absolute left-4 top-1/2 z-20 h-11 w-11 -translate-y-1/2 sm:left-8`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className={`${chromeButton} absolute right-4 top-1/2 z-20 h-11 w-11 -translate-y-1/2 sm:right-8`}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* The media stage — generous, symmetric clearance on every side
          (bigger at top/bottom, where the close button and playback bar
          live) so the media itself never has to share pixels with the
          chrome around it. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          className="flex h-full w-full items-center justify-center px-14 py-20 sm:px-24 sm:py-24"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          drag={items.length > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.6}
          onDragEnd={onDragEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={current.media_url}
              poster={current.thumbnail_url}
              playsInline
              autoPlay
              muted={muted}
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              // h-full/w-full (not just max-h/max-w) so a low-resolution
              // video actually grows to fill the available space instead of
              // rendering at its small native pixel size — max-h/max-w alone
              // only ever shrinks something bigger, never grows something
              // smaller, which is why video used to look tiny next to image.
              className="h-full w-full rounded-xl object-contain shadow-2xl shadow-black/60"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.media_url}
              alt=""
              className="h-full w-full rounded-xl object-contain shadow-2xl shadow-black/60"
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Video's custom playback bar — only rendered for video, nothing
          shown here at all for images. Side padding matches the close
          button's inset above, so the whole chrome reads as one consistent
          margin around the stage rather than mismatched edges. */}
      {isVideo && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-5 pt-12 sm:px-8 sm:pb-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            className={`${chromeButton} h-9 w-9 shrink-0 bg-white/15`}
          >
            {playing ? (
              <PauseIconFill className="h-4 w-4" weight="duotone" />
            ) : (
              <PlayIconFill className="h-4 w-4" weight="duotone" />
            )}
          </button>
          <span className="shrink-0 font-poppins text-[11px] tabular-nums text-white/80">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            className="h-1 flex-1 cursor-pointer accent-brand"
          />
          <span className="shrink-0 font-poppins text-[11px] tabular-nums text-white/80">
            {formatTime(duration)}
          </span>
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => setMuted((m) => !m)}
            className={`${chromeButton} h-9 w-9 shrink-0 bg-white/15`}
          >
            {muted ? (
              <MuteIconFill className="h-4 w-4" weight="duotone" />
            ) : (
              <VolumeIconFill className="h-4 w-4" weight="duotone" />
            )}
          </button>
        </div>
      )}
    </motion.div>,
    document.body,
  );
}
