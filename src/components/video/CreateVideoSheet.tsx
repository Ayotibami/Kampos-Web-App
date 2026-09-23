"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { X, SwitchCamera, ImageIcon } from "@/components/ui/icons";
import { useSpotStore, SpotUploadError, type Spot } from "@/stores/spotStore";

// Spot's own limits — deliberately larger than Gist's incidental video cap,
// matches MAX_VIDEO_DURATION_SECONDS/MAX_VIDEO_BYTES in
// KamposBackend/src/modules/spot/spot.constants.ts.
const MAX_DURATION_SECONDS = 300;
const MAX_BYTES = 200 * 1024 * 1024;
const CAPTION_MAX_LEN = 220;

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

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

  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
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
    setFile(null);
    setFileName("");
    setObjectUrl(null);
    setCaption("");
    setDuration(0);
    setCurrentTime(0);
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
  };

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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, step, facing]);

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
      // startedAtRef is a ref, so it's always current.
      setDuration((Date.now() - startedAtRef.current) / 1000);
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
    if (!recording) return;
    setRecording(false);
    recorderRef.current?.stop();
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
    setFile(f);
    setFileName(f.name || "spot.mp4");
    setObjectUrl(URL.createObjectURL(f));
    setStep("preview");
  };

  const handlePost = async () => {
    if (!file || posting) return;
    setPosting(true);
    setError(null);
    setUploadPercent(0);
    try {
      const spot = await postSpot(file, fileName || "spot.mp4", caption, setUploadPercent);
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

  const progressPct = Math.min(100, (recordedSeconds / MAX_DURATION_SECONDS) * 100);

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
              className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            >
              <X className="h-4 w-4" />
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
              <>
                <div className="absolute inset-x-5 top-[calc(3.25rem+env(safe-area-inset-top,0px))] z-10 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 rounded-full bg-danger/90 px-2.5 py-1 font-nunito text-[11px] font-extrabold tabular-nums text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {formatTime(recordedSeconds)}
                  </span>
                  <span className="rounded-full bg-black/35 px-2.5 py-1 font-nunito text-[10.5px] font-bold tabular-nums text-white/80 backdrop-blur-md">
                    {formatTime(MAX_DURATION_SECONDS)} max
                  </span>
                </div>
                <div className="absolute inset-x-5 top-[calc(4.75rem+env(safe-area-inset-top,0px))] z-10 h-[3px] overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </>
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
                    <span className="absolute -inset-[5px] rounded-full border-[3px] border-brand/55" />
                    <span className="h-[26px] w-[26px] rounded-full bg-brand" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={recording}
                  aria-label="Choose from gallery"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-brand shadow-md disabled:opacity-40"
                >
                  <ImageIcon className="h-[19px] w-[19px]" />
                </button>
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
            <video
              ref={previewVideoRef}
              src={objectUrl ?? undefined}
              // Matches the feed's own object-contain + black bed (see
              // VideoFeedContent) so this preview is a true WYSIWYG of how
              // the clip will actually appear once posted — cropping here
              // and letterboxing there would be a lying preview.
              className="absolute inset-0 h-full w-full bg-black object-contain"
              autoPlay
              loop
              muted
              playsInline
              // A MediaRecorder-produced blob reports Infinity here (a
              // well-known browser quirk — WebM/MP4 written without a
              // duration header until the file is finalized on disk, which
              // never happens for an in-memory blob) — trust it only when
              // it's a real number; a recorded clip already has its real
              // duration set from the recording timer in onstop above, and
              // overwriting that with Infinity is what previously made a
              // 4-second recording falsely trip the "over 5 minutes"
              // warning below.
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) setDuration(d);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />

            <div className="absolute inset-x-4 z-10 flex items-center justify-between top-[calc(1rem+env(safe-area-inset-top,0px))]">
              <button
                type="button"
                onClick={discardPreview}
                disabled={posting}
                aria-label="Discard and choose again"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
              <span className="rounded-full bg-black/40 px-2.5 py-1 font-nunito text-[11px] font-extrabold tabular-nums text-white">
                {formatTime(currentTime)} / {formatTime(Math.min(duration, MAX_DURATION_SECONDS))}
              </span>
            </div>

            {duration > MAX_DURATION_SECONDS && (
              <div className="absolute inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 rounded-xl bg-danger/90 px-3 py-2 font-nunito text-[12px] font-semibold text-white">
                That's over {MAX_DURATION_SECONDS / 60} minutes — trim it before posting.
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 rounded-xl bg-danger/90 px-3 py-2 font-nunito text-[12px] font-semibold text-white">
                {error}
              </div>
            )}

            <div className="absolute inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-10 flex flex-col gap-2.5">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX_LEN))}
                placeholder="Add a caption… (optional)"
                rows={1}
                disabled={posting}
                className="resize-none rounded-2xl bg-black/45 px-3.5 py-2.5 font-nunito text-[13px] font-medium text-white placeholder:text-white/50 backdrop-blur-md focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handlePost()}
                disabled={duration > MAX_DURATION_SECONDS || posting}
                className="flex min-w-[92px] items-center justify-center gap-1.5 self-end rounded-full bg-brand px-6 py-2.5 font-nunito text-[13px] font-extrabold text-white shadow-lg shadow-brand/40 disabled:opacity-70"
              >
                {posting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {uploadPercent > 0 ? `${uploadPercent}%` : "Posting…"}
                  </>
                ) : (
                  "Post"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
