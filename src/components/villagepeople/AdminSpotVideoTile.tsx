"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlayIconFill, VolumeIconFill, MuteIconFill, ExpandIconFill, X } from "@/components/ui/icons";
import { cloudinaryVideo } from "@/lib/cloudinary";

/**
 * The autoplay-on-scroll video box shared by every admin surface that shows
 * a Spot's own clip — originally built for AdminSpotCard (the All Spots
 * browse screen), then extracted here so SpotReportsTab's rows get the
 * exact same "watch while scrolling" review experience instead of the
 * static click-to-preview thumbnail it started with. A real, sizeable box
 * (not a thumbnail) — muted, looping, and driven by an IntersectionObserver
 * so it only plays while THIS tile is actually on screen (pauses the
 * instant it scrolls away, same "don't keep a dozen clips silently playing
 * at once" reasoning the consumer feed's own windowing follows, just via
 * play/pause here instead of unmounting). threshold: 0.5 — at least half
 * the clip visible, matching how "scrolled into view" reads intuitively in
 * a plain vertical list (not the consumer feed's stricter 0.6, which gates
 * which single card is "the" active one in a snap feed; this just gates
 * whether THIS tile should be playing at all, several of which could in
 * principle be half-visible at once during a fast scroll — each decides for
 * itself). A small mute toggle sits on the video itself for real audio
 * without leaving the list; the expand icon opens a bigger, real
 * `<video controls>` view via VideoPreviewModal below.
 */
export function AdminSpotVideoTile({
  mediaUrl,
  thumbnailUrl,
}: {
  mediaUrl: string | null;
  thumbnailUrl: string | null;
}) {
  const [muted, setMuted] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !mediaUrl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mediaUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  return (
    <>
      <div className="relative h-64 w-36 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-black/5">
        {mediaUrl ? (
          <video
            ref={videoRef}
            src={cloudinaryVideo(mediaUrl)}
            poster={thumbnailUrl ?? undefined}
            muted={muted}
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/20 to-brand/5">
            <PlayIconFill className="h-6 w-6 text-brand/50" weight="fill" />
          </div>
        )}
        {mediaUrl && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            >
              {muted ? <MuteIconFill className="h-4 w-4" weight="fill" /> : <VolumeIconFill className="h-4 w-4" weight="fill" />}
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              aria-label="Open a bigger preview"
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <ExpandIconFill className="h-4 w-4" weight="bold" />
            </button>
          </>
        )}
      </div>
      <VideoPreviewModal open={showPreview} src={mediaUrl} onClose={() => setShowPreview(false)} />
    </>
  );
}

/** A real, controllable preview of the actual clip — same "an admin needs
 * to see the real thing to judge it" reasoning AdminGistCard's own
 * GistMediaOverlay reuse follows, just for video. Built directly on Modal
 * rather than reusing the consumer feed's VideoCard, which comes with an
 * entire swipe-feed/autoplay/mute-state apparatus this single-clip review
 * dialog has no use for. */
export function VideoPreviewModal({ open, src, onClose }: { open: boolean; src: string | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} className="relative flex max-h-[85vh] w-[min(92vw,420px)] items-center justify-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
      >
        <X className="h-4 w-4" />
      </button>
      {open && src && (
        <video
          src={cloudinaryVideo(src)}
          controls
          autoPlay
          playsInline
          className="max-h-[85vh] w-full rounded-2xl bg-black"
        />
      )}
    </Modal>
  );
}
