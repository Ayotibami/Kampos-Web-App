"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  X,
  SwitchCamera,
  ImageIcon,
  RefreshCw,
  SendIconFill,
  VolumeIconFill,
  MuteIconFill,
  PlayIconFill,
} from "@/components/ui/icons";
import { useSpotStore, SpotUploadError, type Spot } from "@/stores/spotStore";

// Spot's own limits — deliberately larger than Gist's incidental video cap,
// matches MAX_VIDEO_DURATION_SECONDS/MAX_VIDEO_BYTES in
// KamposBackend/src/modules/spot/spot.constants.ts.
const MAX_DURATION_SECONDS = 300;
const MAX_BYTES = 200 * 1024 * 1024;
const CAPTION_MAX_LEN = 220;
// Grows with the content up to this ceiling, then scrolls inside itself —
// same pattern as CommentComposer's COMPOSER_MAX_HEIGHT, just a shorter
// ceiling since captions here cap out at 220 characters vs. a full comment.
const CAPTION_MAX_HEIGHT = 120;
// Floor on the selected trim range — without this, dragging both handles
// to the same point would select a zero-length (unplayable) clip.
const MIN_TRIM_SECONDS = 1;

// Heading shown over the live camera before recording starts — picked once
// per sheet-open, not rotated while it's on screen (same pattern as
// FeedContent's pickRandomPrompt() for the Gist composer placeholder: one
// fresh pick per mount, never the same line twice in a row).
const SPOT_HEADINGS = [
  "Show us wetin dey happen for campus!",
  "Spot something interesting? Make we see am",
  "Abeg, show us a spot on campus",
  "Oya, create your own spot",
];
const SPOT_DESCRIPTION =
  "A Spot is you capturing moments, events, drama — whatever's happening on campus, right now.";

let lastHeadingIndex = -1;
function pickRandomSpotHeading(): string {
  let idx = Math.floor(Math.random() * SPOT_HEADINGS.length);
  if (SPOT_HEADINGS.length > 1) {
    while (idx === lastHeadingIndex) idx = Math.floor(Math.random() * SPOT_HEADINGS.length);
  }
  lastHeadingIndex = idx;
  return SPOT_HEADINGS[idx];
}

// MediaRecorder's supported container/codec set varies by browser — pick the
// best one this browser actually supports instead of hardcoding one, or
// recording throws immediately on anything but Chrome/Firefox.
function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? "";
}
function extensionForMimeType(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

// Optical/digital zoom via MediaTrackConstraints isn't part of the standard
// TS lib types (it's a real, implemented Chromium/Android extension, just
// not in every browser or on most webcams/desktops) — a small local shape
// instead of `any`, cast through `unknown` since MediaTrackCapabilities
// doesn't declare it.
interface ZoomRange {
  min: number;
  max: number;
  step: number;
}
function getZoomRange(track: MediaStreamTrack): ZoomRange | null {
  const caps = track.getCapabilities?.() as unknown as (MediaTrackCapabilities & { zoom?: ZoomRange }) | undefined;
  return caps?.zoom ?? null;
}
function applyZoom(track: MediaStreamTrack, value: number) {
  void track.applyConstraints({ advanced: [{ zoom: value } as unknown as MediaTrackConstraintSet] }).catch(() => {});
}

/** Chrome (and other browsers) can leave a <video> pointed at a
 * MediaRecorder blob in a broken-but-claims-fine state: readyState says 4
 * and paused says false, but currentTime never advances and
 * videoWidth/videoHeight report bogus tiny values (2×2, observed here) —
 * because the blob has no duration/seek index for the demuxer to key off
 * of, and just calling play() on it directly never resolves that. Seeking
 * to a huge timestamp and back is the standard, widely-documented fix: it
 * forces the browser to actually scan the file and fix up its internal
 * duration/seek table before real playback can start. Harmless no-op for
 * an already-well-formed file (an uploaded gallery pick already plays
 * fine without this). */
function unstickRecordedVideo(video: HTMLVideoElement) {
  const onTimeUpdate = () => {
    video.removeEventListener("timeupdate", onTimeUpdate);
    video.currentTime = 0;
    void video.play().catch(() => {});
  };
  video.addEventListener("timeupdate", onTimeUpdate);
  video.currentTime = 1e7;
}

/** First frame of a video blob as a small JPEG data URL — used for the
 * gallery button's thumbnail once someone has picked a clip. Real thing a
 * website can never do is read the actual last photo in someone's camera
 * roll (no browser API grants that — a deliberate privacy boundary); this
 * only ever shows what was already explicitly picked in this sheet. */
function makeVideoThumbnail(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    // Not captured directly on loadeddata — that can fire before a frame
    // is actually decoded and painted (a real, if occasional, browser
    // timing quirk that produced a solid-black thumbnail in testing here).
    // Seeking to a small definite offset and waiting for onseeked
    // guarantees a real decoded frame is what gets drawn.
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.15, (video.duration || 0.3) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 100;
      canvas.height = video.videoHeight || 100;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    video.onerror = () => resolve(null);
    video.src = url;
  });
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Same traffic-light thresholds as CreateGistSheet's CharCountRing (green
// while there's plenty of runway left, amber then red as the recording
// nears MAX_DURATION_SECONDS) — reusing that language here instead of
// inventing a new one.
function ringColor(remaining: number, max: number): string {
  if (remaining > max * 0.2) return "#22c55e";
  if (remaining > max * 0.1) return "#f59e0b";
  return "#ef4444";
}

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Circular record-progress indicator — elapsed time centered inside a
 * ring that fills clockwise toward MAX_DURATION_SECONDS, with a small
 * pulsing "REC" label beside it (the top bar read as too empty with just
 * the ring on one side and the close button on the other). */
function RecordingProgressRing({ elapsed, max }: { elapsed: number; max: number }) {
  const progress = Math.min(elapsed / max, 1);
  const color = ringColor(max - elapsed, max);
  return (
    <div className="absolute left-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 flex items-start gap-2">
      <div className="flex flex-col items-center gap-1">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
          <svg width={RING_SIZE} height={RING_SIZE} className="absolute inset-0 -rotate-90">
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            />
          </svg>
          <span className="relative font-nunito text-[9px] font-extrabold tabular-nums text-white">{formatTime(elapsed)}</span>
        </div>
        <span className="font-nunito text-[8.5px] font-bold tabular-nums text-white/60">of {formatTime(max)}</span>
      </div>
      <span className="mt-1.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-md">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
        <span className="font-nunito text-[10px] font-extrabold uppercase tracking-wide text-white">Rec</span>
      </span>
    </div>
  );
}

/**
 * Dual-handle trim range selector, drawn over the clip's full duration.
 * Dragging either handle live-scrubs the preview to that exact frame (so
 * you can actually see what you're cutting to, not just watch numbers
 * change) and pauses playback for the duration of the drag; releasing
 * resumes play from the new start. The region between the handles is the
 * part that actually gets posted — everything outside it is dimmed.
 */
function TrimBar({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  onTrimChange,
  onScrubPreview,
  onDragStateChange,
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  onTrimChange: (start: number, end: number) => void;
  onScrubPreview: (time: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || !duration) return 0;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return frac * duration;
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (which: "start" | "end") => (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = which;
      onDragStateChange(true);
    },
    [onDragStateChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      e.stopPropagation();
      const t = timeFromClientX(e.clientX);
      if (draggingRef.current === "start") {
        const nextStart = Math.max(0, Math.min(t, trimEnd - MIN_TRIM_SECONDS));
        onTrimChange(nextStart, trimEnd);
        onScrubPreview(nextStart);
      } else {
        const nextEnd = Math.min(duration, Math.max(t, trimStart + MIN_TRIM_SECONDS));
        onTrimChange(trimStart, nextEnd);
        onScrubPreview(nextEnd);
      }
    },
    [duration, trimStart, trimEnd, timeFromClientX, onTrimChange, onScrubPreview],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      e.stopPropagation();
      draggingRef.current = null;
      onDragStateChange(false);
    },
    [onDragStateChange],
  );

  const startPct = duration ? (trimStart / duration) * 100 : 0;
  const endPct = duration ? (trimEnd / duration) * 100 : 100;
  const playheadPct = duration ? (Math.min(Math.max(currentTime, trimStart), trimEnd) / duration) * 100 : 0;

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-8 w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/15" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-l-full bg-black/55"
          style={{ left: 0, width: `${startPct}%` }}
        />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-r-full bg-black/55"
          style={{ right: 0, width: `${100 - endPct}%` }}
        />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 bg-gradient-to-r from-brand-accent to-brand"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <div
          className="pointer-events-none absolute top-0 z-10 h-8 w-[2px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_3px_rgba(0,0,0,0.6)]"
          style={{ left: `${playheadPct}%` }}
        />
        {/* Handles: a generous 28px hit target (touch-friendly, matching
            this app's other drag controls) around a slimmer visible grip,
            not a hit area limited to what's actually painted. */}
        <button
          type="button"
          aria-label="Trim start"
          onPointerDown={handlePointerDown("start")}
          className="absolute top-0 z-20 flex h-8 w-7 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white shadow-md"
          style={{ left: `${startPct}%` }}
        >
          <span className="h-3.5 w-[3px] rounded-full bg-brand" />
        </button>
        <button
          type="button"
          aria-label="Trim end"
          onPointerDown={handlePointerDown("end")}
          className="absolute top-0 z-20 flex h-8 w-7 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full bg-white shadow-md"
          style={{ left: `${endPct}%` }}
        >
          <span className="h-3.5 w-[3px] rounded-full bg-brand" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-nunito text-[10px] font-bold tabular-nums text-white/60">{formatTime(trimStart)}</span>
        <span className="rounded-full bg-brand/25 px-2 py-0.5 font-nunito text-[10px] font-extrabold tabular-nums text-brand-accent">
          {formatTime(trimEnd - trimStart)} selected
        </span>
        <span className="font-nunito text-[10px] font-bold tabular-nums text-white/60">{formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}

/**
 * Posting flow for the Spot tab — a live, in-sheet camera by default (same
 * getUserMedia technique as Gist's WebcamCapture, extended here from a photo
 * snapshot to a real MediaRecorder video capture), with switching to the
 * device's own file picker one tap away instead of the default. "Post" runs
 * the real draft → signature → direct-to-Cloudinary upload → finalize
 * sequence (see spotStore.postSpot) — the preview here plays from a local
 * blob URL only until that resolves, then ownership passes to the feed with
 * the real Cloudinary URL.
 */
export function CreateVideoSheet({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: (post: Spot) => void;
}) {
  const postSpot = useSpotStore((s) => s.postSpot);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Handle to the imperatively-created preview <video> (see the effect
  // below) — needed so the scrub bar, tap-to-pause, and mute toggle can
  // reach it, since it isn't a ref-attached JSX element.
  const previewVideoElRef = useRef<HTMLVideoElement | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  // True while `duration` holds a value we already trust (measured from the
  // recording timer, in onstop below) — set false for an uploaded file,
  // which has no such ground truth. Guards the preview <video>'s own
  // onLoadedMetadata from overwriting a known-good recorded duration with
  // whatever a MediaRecorder blob's still-missing duration header resolves
  // to (Infinity is the commonly-cited case, but not the only bogus value
  // browsers have been seen to report for it — a ref, not state, since it's
  // only ever read inside that one event handler, not during render).
  const trustedDurationRef = useRef(false);

  const [step, setStep] = useState<"camera" | "preview">("camera");
  const [heading, setHeading] = useState(SPOT_HEADINGS[0]);
  // Rear camera by default — Spot is about capturing what's happening
  // around you on campus, not a selfie, so "environment" is the more useful
  // starting point (WebcamCapture's photo picker defaults to "user"
  // instead, since that's for a compose-sheet avatar/personal shot — a
  // different job).
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  // null until the current camera's video track reports zoom support —
  // most desktop webcams and plenty of phones don't, so the slider only
  // renders once we actually know it'll do something.
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoom, setZoom] = useState(1);
  // Thumbnail of whatever was last picked via the gallery button, this
  // sheet-open only — not persisted, not the real camera roll (see
  // makeVideoThumbnail's own doc for why that's never possible on the web).
  const [lastPickedThumbUrl, setLastPickedThumbUrl] = useState<string | null>(null);

  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewPaused, setPreviewPaused] = useState(false);
  // Defaults muted — consistent, no surprise audio blasting on open — one
  // tap to actually hear the clip. Previously there was no way to unmute
  // the preview at all, so there was no way to confirm audio recorded.
  const [previewMuted, setPreviewMuted] = useState(true);
  // Selected [trimStart, trimEnd] range within the clip — starts as the
  // full clip (see the reset effect below) until the user actually drags a
  // handle. Refs mirror these for the imperative video-loop effect further
  // down, which can't have trimStart/trimEnd in its own dependency array
  // without recreating the whole <video> element on every drag frame.
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(0);
  const trimReadyForUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const discardPreview = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    trustedDurationRef.current = false;
    trimReadyForUrlRef.current = null;
    setFile(null);
    setFileName("");
    setObjectUrl(null);
    setCaption("");
    setDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setTrimming(false);
    setError(null);
    setPosting(false);
    setUploadPercent(0);
    setStep("camera");
  };

  const reset = () => {
    discardPreview();
    setCameraError(null);
    setRecording(false);
    setRecordedSeconds(0);
    setLastPickedThumbUrl(null);
  };

  // Initializes trim to the clip's full range exactly once per NEW clip —
  // guarded by URL, not just "duration > 0", so it doesn't keep resetting
  // an in-progress trim selection if `duration` happens to tick again for
  // the SAME clip (e.g. a later, more accurate value replacing an initial
  // guess).
  useEffect(() => {
    if (!objectUrl || duration <= 0) return;
    if (trimReadyForUrlRef.current === objectUrl) return;
    trimReadyForUrlRef.current = objectUrl;
    setTrimStart(0);
    setTrimEnd(duration);
  }, [objectUrl, duration]);

  useEffect(() => {
    trimStartRef.current = trimStart;
  }, [trimStart]);
  useEffect(() => {
    trimEndRef.current = trimEnd;
  }, [trimEnd]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setHeading(pickRandomSpotHeading());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live camera stream — only while the sheet is open and showing the
  // camera step, restarted whenever `facing` flips. Mirrors WebcamCapture's
  // own start/stop effect, extended to also request a mic (needed for
  // MediaRecorder to actually capture sound, unlike the photo-only capture
  // there).
  useEffect(() => {
    if (!open || step !== "camera") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraError(null);
        setStreamReady(true);
        const videoTrack = stream.getVideoTracks()[0];
        const range = videoTrack ? getZoomRange(videoTrack) : null;
        setZoomRange(range);
        setZoom(range?.min ?? 1);
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          await liveVideoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setCameraError("No vex — I no fit reach your camera or mic. Check say you allow permission.");
        }
      }
    })();
    return () => {
      cancelled = true;
      setStreamReady(false);
      setZoomRange(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, step, facing]);

  const handleZoomChange = (value: number) => {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) applyZoom(track, value);
  };

  // The preview player is a plain DOM <video> created and inserted here,
  // not JSX — confirmed empirically, many different ways (ref vs event
  // target, declarative vs imperative src, with/without a seek-based
  // unstick, with/without a delay before mounting, counting src
  // assignments to rule out a double-invoke), that THIS sheet's own
  // preview element reliably ends up stuck reporting a 2×2 video with a
  // null duration and a frame frozen at time 0 for a recorded clip —
  // while a brand-new element pointed at the exact same blob URL, even
  // one inserted right next to the broken one in the identical live
  // layout, loads correctly every single time with no exceptions found.
  // Root mechanism not pinned down; this sidesteps it entirely by only
  // ever using elements proven to work.
  useEffect(() => {
    if (step !== "preview" || !objectUrl) return;
    const container = previewContainerRef.current;
    if (!container) return;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    // Matches the feed's own object-contain + black bed (see
    // VideoFeedContent) so this preview is a true WYSIWYG of how the clip
    // will actually appear once posted — cropping here and letterboxing
    // there would be a lying preview.
    video.className = "absolute inset-0 h-full w-full bg-black object-contain";
    previewVideoElRef.current = video;
    setPreviewPaused(false);
    setPreviewMuted(true);
    const onLoadedMetadata = () => {
      unstickRecordedVideo(video);
      // For a recorded clip, `duration` is already the real measured value
      // (trustedDurationRef, set in onstop) — skip this rather than let it
      // overwrite that with whatever a MediaRecorder blob's still-missing
      // duration header resolves to (commonly null/Infinity, but browsers
      // vary, and any bogus value here previously made a several-second
      // recording falsely trip the "over 5 minutes" warning below). An
      // uploaded file has no such ground truth, so it's the only case this
      // is trusted for.
      if (!trustedDurationRef.current && Number.isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Loop within the SELECTED range, not just the clip's full native
      // end — trimEndRef/trimStartRef (not trimEnd/trimStart directly) so
      // this handler, defined once per clip, always reads the latest
      // dragged values without needing this whole effect (and the <video>
      // element it creates) to be recreated every time a handle moves.
      const end = trimEndRef.current;
      if (end > 0 && video.currentTime >= end) {
        video.currentTime = trimStartRef.current;
      }
    };
    const onPlay = () => setPreviewPaused(false);
    const onPause = () => setPreviewPaused(true);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    container.appendChild(video);
    video.src = objectUrl;

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      previewVideoElRef.current = null;
    };
  }, [step, objectUrl]);

  const togglePreviewPlayback = () => {
    const video = previewVideoElRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const togglePreviewMute = () => {
    const video = previewVideoElRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setPreviewMuted(video.muted);
  };

  const handleScrub = (value: number) => {
    const video = previewVideoElRef.current;
    if (video) video.currentTime = value;
    setCurrentTime(value);
  };

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  };

  // Pauses for the duration of a handle drag (fighting the loop logic
  // above while scrubbing would fight the drag itself) and resumes
  // wherever the drag left the playhead once released — it naturally
  // loops back to the new trimStart on its own the next time it reaches
  // trimEnd, so there's no need to force a seek back to the start here.
  const handleTrimDragStateChange = (dragging: boolean) => {
    setTrimming(dragging);
    const video = previewVideoElRef.current;
    if (!video) return;
    if (dragging) video.pause();
    else void video.play().catch(() => {});
  };

  // Grows the caption textarea to fit its content, up to CAPTION_MAX_HEIGHT
  // — past that it scrolls internally instead of pushing the Post button
  // further down. Same approach as CommentComposer's own auto-grow effect.
  useEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, CAPTION_MAX_HEIGHT)}px`;
  }, [caption]);

  const handleStartRecording = () => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    const mimeType = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      setCameraError("Recording no dey work for this browser — try uploading a clip instead.");
      return;
    }
    chunksRef.current = [];
    discardRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (discardRef.current) return;
      const type = recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size === 0) return;
      if (blob.size > MAX_BYTES) {
        setCameraError(`That clip's too big — max ${Math.round(MAX_BYTES / 1024 / 1024)}MB. Try a shorter one.`);
        return;
      }
      setFile(blob);
      setFileName(`spot-${Date.now()}.${extensionForMimeType(type)}`);
      setObjectUrl(URL.createObjectURL(blob));
      // Not `recordedSeconds` — this closure was created back when
      // recording started, so that state is frozen at whatever it was at
      // that instant (0), not the latest tick from the interval below.
      // startedAtRef is a ref, so it's always current. Clamped to the cap:
      // when the auto-stop-at-max path (below) is what ends the recording,
      // real elapsed time by the time this actually fires is always a
      // little past it — the 200ms tick granularity plus MediaRecorder's
      // own stop/finalization delay — which would otherwise make the "over
      // the limit" warning (and the disabled Post button that comes with
      // it) fire on a clip the app itself cut off exactly at the limit,
      // with no trim UI to recover from it.
      setDuration(Math.min((Date.now() - startedAtRef.current) / 1000, MAX_DURATION_SECONDS));
      trustedDurationRef.current = true;
      setStep("preview");
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    // Real wall-clock time, read once at the moment the user tapped record
    // (an event handler, not render) — needed so the elapsed-seconds ticker
    // below stays accurate even if a render is skipped/delayed, unlike
    // counting ticks.
    // eslint-disable-next-line react-hooks/purity
    startedAtRef.current = Date.now();
    setRecordedSeconds(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      if (elapsed >= MAX_DURATION_SECONDS) {
        setRecordedSeconds(MAX_DURATION_SECONDS);
        handleStopRecording();
        return;
      }
      setRecordedSeconds(elapsed);
    }, 200);
  };

  const handleStopRecording = () => {
    // Checking the recorder's own `.state` (not the `recording` React
    // state) matters here: this same function is also called from inside
    // handleStartRecording's setInterval callback, whose closure was
    // created at recording-start — where `recording` was still false — so
    // `if (!recording) return` silently no-op'd every single time,
    // permanently breaking the auto-stop-at-max-duration path. The
    // recorder's `.state` is read fresh off the ref, not a stale closure.
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setRecording(false);
    recorder.stop();
  };

  const handleClose = () => {
    if (posting) return;
    if (recording) {
      discardRef.current = true;
      stopTimer();
      recorderRef.current?.stop();
    }
    onClose();
  };

  const handleFlip = () => {
    if (recording) return;
    setFacing((f) => (f === "user" ? "environment" : "user"));
  };

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setCameraError("That doesn't look like a video file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setCameraError(`That file's too big — max ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
      return;
    }
    setCameraError(null);
    trustedDurationRef.current = false;
    setFile(f);
    setFileName(f.name || "spot.mp4");
    const url = URL.createObjectURL(f);
    setObjectUrl(url);
    setStep("preview");
    void makeVideoThumbnail(url).then((thumb) => {
      if (thumb) setLastPickedThumbUrl(thumb);
    });
  };

  const handlePost = async () => {
    if (!file || posting) return;
    setPosting(true);
    setError(null);
    setUploadPercent(0);
    // A tolerance, not an exact-zero check — floats drift, and the goal is
    // "did the user actually move a handle," not "is this bit-identical to
    // the untouched default."
    const isTrimmed = trimStart > 0.05 || trimEnd < duration - 0.05;
    try {
      const spot = await postSpot(
        file,
        fileName || "spot.mp4",
        caption,
        setUploadPercent,
        isTrimmed ? { start: trimStart, end: trimEnd } : undefined,
      );
      onPosted(spot);
      // Ownership of the local preview ends here on success — the feed now
      // has the real, Cloudinary-hosted spot. reset() (via the `open`
      // effect once the parent closes this sheet) is what actually revokes
      // the blob URL; nothing here needs to keep it alive any further.
      setFile(null);
      setFileName("");
      setObjectUrl(null);
      setCaption("");
      setDuration(0);
      setCurrentTime(0);
      setTrimStart(0);
      setTrimEnd(0);
      setPosting(false);
      setUploadPercent(0);
    } catch (err) {
      // Keep the draft (file/caption/preview) intact on failure — the user
      // shouldn't have to re-record and retype the caption just because the
      // upload hiccupped. Same "don't throw the draft away on failure"
      // reasoning CreateGistSheet's own optimistic-post error path follows.
      const message =
        err instanceof SpotUploadError ? err.message : err instanceof Error ? err.message : "Couldn't post your Spot — please try again.";
      setError(message);
      setPosting(false);
      setUploadPercent(0);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} className="h-[100dvh] w-full max-w-none rounded-none">
      <div className="flex h-full w-full flex-col bg-black">
        {step === "camera" ? (
          <div className="relative h-full w-full overflow-hidden bg-black">
            {cameraError ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                <p className="font-nunito text-sm text-white/80">{cameraError}</p>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFacing((f) => f)}
                    className="rounded-full bg-white/10 px-5 py-2.5 font-nunito text-[13px] font-bold text-white active:scale-95"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="rounded-full bg-brand px-5 py-2.5 font-nunito text-[13px] font-extrabold text-white shadow-lg shadow-brand/40 active:scale-95"
                  >
                    Upload instead
                  </button>
                </div>
              </div>
            ) : (
              <video
                ref={liveVideoRef}
                playsInline
                muted
                className={`absolute inset-0 h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
              />
            )}

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-md ring-1 ring-white/10 backdrop-blur-md"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </button>

            {!cameraError && !recording && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[38%]"
                  style={{
                    background: "linear-gradient(180deg, rgba(9,25,55,.82) 0%, rgba(9,25,55,.35) 65%, transparent 100%)",
                  }}
                />
                <div className="absolute left-5 right-14 top-[calc(3.25rem+env(safe-area-inset-top,0px))] z-10">
                  <div className="font-nunito text-[19px] font-extrabold leading-tight tracking-tight text-white">{heading}</div>
                  <div className="mt-2 font-nunito text-[11.5px] font-medium leading-relaxed text-white/75">{SPOT_DESCRIPTION}</div>
                </div>
              </>
            )}

            {!cameraError && recording && (
              <RecordingProgressRing elapsed={recordedSeconds} max={MAX_DURATION_SECONDS} />
            )}

            {!cameraError && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[34%]"
                style={{ background: "linear-gradient(0deg, rgba(0,0,0,.7) 0%, transparent 100%)" }}
              />
            )}

            {!cameraError && (
              <div className="absolute inset-x-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleFlip}
                  disabled={recording}
                  aria-label="Switch camera"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-brand shadow-md disabled:opacity-40"
                >
                  <SwitchCamera className="h-[19px] w-[19px]" />
                </button>

                {recording ? (
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    aria-label="Stop recording"
                    className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white"
                  >
                    <span className="absolute -inset-[5px] rounded-full border-[3px] border-danger/60" />
                    <span className="h-6 w-6 rounded-[7px] bg-danger" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={!!cameraError || !streamReady}
                    aria-label="Start recording"
                    className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white shadow-[0_0_0_7px_rgba(11,176,255,0.16),0_8px_24px_-6px_rgba(22,90,191,0.65)] disabled:opacity-60"
                  >
                    {/* Faint base ring, always visible, so the button reads
                        as "ringed" even on the side the spinning highlight
                        below isn't currently passing over. */}
                    <span className="absolute -inset-[5px] rounded-full border-[3px] border-brand/30" />
                    {/* The animated highlight: a masked conic-gradient arc
                        (the mask keeps only a thin ring band, so the
                        gradient itself never shows as a filled disc)
                        spinning continuously via Tailwind's animate-spin —
                        reads as a light trail circling the button, not
                        just a static glow. */}
                    <span
                      aria-hidden
                      className="absolute -inset-[5px] animate-spin rounded-full motion-reduce:animate-none"
                      style={{
                        background:
                          "conic-gradient(from 0deg, transparent 0%, var(--color-brand-accent) 10%, var(--color-brand) 22%, transparent 38%)",
                        WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                        maskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                      }}
                    />
                    <span className="h-[26px] w-[26px] rounded-full bg-brand" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={recording}
                  aria-label="Choose from gallery"
                  className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/90 text-brand shadow-md disabled:opacity-40"
                >
                  {lastPickedThumbUrl ? (
                    // A canvas-drawn data: URL, not a remote/optimizable image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lastPickedThumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-[19px] w-[19px]" />
                  )}
                </button>
              </div>
            )}

            {!cameraError && !recording && zoomRange && (
              <div className="absolute inset-x-6 bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] z-10 flex items-center gap-2.5 rounded-full bg-black/40 px-3.5 py-2 backdrop-blur-md">
                <span className="font-nunito text-[10px] font-bold tabular-nums text-white/70">1x</span>
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step || 0.1}
                  value={zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  aria-label="Zoom"
                  className="h-1.5 flex-1 accent-brand"
                />
                <span className="min-w-[28px] text-right font-nunito text-[10px] font-bold tabular-nums text-white/70">
                  {zoomRange.max.toFixed(zoomRange.max % 1 === 0 ? 0 : 1)}x
                </span>
              </div>
            )}

            <input
              ref={uploadInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="relative h-full w-full bg-black">
            {/* Not a JSX <video> — see the effect above for why: this
                sheet's own preview element reliably got stuck reporting a
                2×2 video with no duration for a recorded clip (confirmed
                empirically many different ways), while a brand-new element
                created fresh and pointed at the exact same blob URL always
                loaded correctly, every time, no exceptions found. This
                container just holds whatever that effect creates. Its own
                onClick is the tap-to-pause toggle — the imperatively
                inserted <video> is a real DOM child, so a tap on it
                genuinely bubbles up to this handler. */}
            <div ref={previewContainerRef} onClick={togglePreviewPlayback} className="absolute inset-0 h-full w-full bg-black" />

            {previewPaused && (
              <button
                type="button"
                onClick={togglePreviewPlayback}
                aria-label="Play"
                className="absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
              >
                <PlayIconFill className="ml-0.5 h-6 w-6" weight="fill" />
              </button>
            )}

            {/* Close sits alone, isolated at the very top — matching where
                it sits on the camera step, so the same control lands in the
                same spot across both steps. Retake/Mute share the row
                below it (Retake left, Mute right, spacing guaranteed by
                justify-between rather than independent absolute offsets),
                with a deliberate gap between the two rows (3.5rem vs.
                Close's 1rem+8px height) so they never crowd each other.
                Playback (the scrub bar) sits at the bottom instead, right
                above the caption/post controls — the conventional spot for
                a player's progress bar, next to the rest of the bottom
                chrome rather than isolated at the very top of the screen. */}
            <div className="absolute inset-x-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={posting}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md disabled:opacity-40"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="absolute inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 flex items-center justify-between">
              <button
                type="button"
                onClick={discardPreview}
                disabled={posting}
                className="flex items-center gap-1.5 rounded-full bg-black/40 py-1.5 pl-2 pr-3 font-nunito text-[11.5px] font-extrabold text-white backdrop-blur-md disabled:opacity-40"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retake
              </button>
              <button
                type="button"
                onClick={togglePreviewMute}
                aria-label={previewMuted ? "Unmute" : "Mute"}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md"
              >
                {previewMuted ? <MuteIconFill className="h-3.5 w-3.5" weight="fill" /> : <VolumeIconFill className="h-3.5 w-3.5" weight="fill" />}
              </button>
            </div>

            {trimEnd - trimStart > MAX_DURATION_SECONDS && (
              <div className="absolute inset-x-4 top-[calc(6rem+env(safe-area-inset-top,0px))] z-10 rounded-xl bg-danger/90 px-3 py-2 font-nunito text-[12px] font-semibold text-white">
                That's over {MAX_DURATION_SECONDS / 60} minutes — drag the trim handles closer together before posting.
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-[calc(6rem+env(safe-area-inset-top,0px))] z-10 rounded-xl bg-danger/90 px-3 py-2 font-nunito text-[12px] font-semibold text-white">
                {error}
              </div>
            )}

            <div className="absolute inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col gap-4">
              {trimming && (
                <span className="self-center rounded-full bg-black/70 px-3 py-1 font-nunito text-[11px] font-extrabold tabular-nums text-white backdrop-blur-md">
                  {formatTime(currentTime)}
                </span>
              )}
              <TrimBar
                duration={duration}
                trimStart={trimStart}
                trimEnd={trimEnd || duration}
                currentTime={currentTime}
                onTrimChange={handleTrimChange}
                onScrubPreview={handleScrub}
                onDragStateChange={handleTrimDragStateChange}
              />
              <div className="flex flex-col gap-1.5 rounded-2xl bg-white/10 px-3.5 py-3 ring-1 ring-white/15 backdrop-blur-md">
                <textarea
                  ref={captionRef}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX_LEN))}
                  placeholder="Add a caption… (optional)"
                  rows={1}
                  disabled={posting}
                  style={{ maxHeight: CAPTION_MAX_HEIGHT }}
                  className="resize-none overflow-y-auto bg-transparent font-nunito text-[13px] font-medium text-white placeholder:text-white/50 focus:outline-none disabled:opacity-60"
                />
                <span
                  className={`self-end font-nunito text-[10px] font-bold tabular-nums ${
                    CAPTION_MAX_LEN - caption.length <= 20 ? "text-danger" : "text-white/40"
                  }`}
                >
                  {caption.length} / {CAPTION_MAX_LEN}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handlePost()}
                disabled={trimEnd - trimStart > MAX_DURATION_SECONDS || posting}
                className="flex min-w-[136px] items-center justify-center gap-1.5 self-end rounded-full bg-brand px-6 py-2.5 font-nunito text-[13px] font-extrabold text-white shadow-lg shadow-brand/40 disabled:opacity-70"
              >
                {posting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {uploadPercent > 0 ? `${uploadPercent}%` : "Posting…"}
                  </>
                ) : (
                  <>
                    <SendIconFill className="h-3.5 w-3.5" weight="fill" />
                    Post to Spot
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
