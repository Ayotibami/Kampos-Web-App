"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Camera, Clapperboard, ImageIcon, X } from "@/components/ui/icons";
import { useSpotStore, SpotUploadError, type Spot } from "@/stores/spotStore";

// Spot's own limits — deliberately larger than Gist's incidental video cap,
// matches MAX_VIDEO_DURATION_SECONDS/MAX_VIDEO_BYTES in
// KamposBackend/src/modules/spot/spot.constants.ts.
const MAX_DURATION_SECONDS = 300;
const MAX_BYTES = 200 * 1024 * 1024;
const CAPTION_MAX_LEN = 220;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Posting flow for the Spot tab — chooser (record or upload) then a
 * preview + optional caption before posting. "Record" and "Upload" are both
 * genuinely wired to a real file, not stubs: two plain file inputs, one
 * with `capture="environment"` (opens the phone's actual camera app on
 * mobile) and one without (opens the gallery/file picker) — no in-browser
 * camera UI to build for this pass, since the OS's own camera already does
 * the job. "Post" runs the real draft → signature → direct-to-Cloudinary
 * upload → finalize sequence (see spotStore.postSpot) — the preview here
 * plays from a local blob URL only until that resolves, then ownership
 * passes to the feed with the real Cloudinary URL.
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
  const recordInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const reset = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setFile(null);
    setObjectUrl(null);
    setCaption("");
    setDuration(0);
    setCurrentTime(0);
    setError(null);
    setPosting(false);
    setUploadPercent(0);
  };

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("That doesn't look like a video file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`That file's too big — max ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
      return;
    }
    setError(null);
    setFile(f);
    setObjectUrl(URL.createObjectURL(f));
  };

  const handlePost = async () => {
    if (!file || posting) return;
    setPosting(true);
    setError(null);
    setUploadPercent(0);
    try {
      const spot = await postSpot(file, file.name || "spot.mp4", caption, setUploadPercent);
      onPosted(spot);
      // Ownership of the local preview ends here on success — the feed now
      // has the real, Cloudinary-hosted spot. reset() (via the `open`
      // effect once the parent closes this sheet) is what actually revokes
      // the blob URL; nothing here needs to keep it alive any further.
      setFile(null);
      setObjectUrl(null);
      setCaption("");
      setDuration(0);
      setCurrentTime(0);
      setPosting(false);
      setUploadPercent(0);
    } catch (err) {
      // Keep the draft (file/caption/preview) intact on failure — the user
      // shouldn't have to re-pick the clip and retype the caption just
      // because the upload hiccupped. Same "don't throw the draft away on
      // failure" reasoning CreateGistSheet's own optimistic-post error path
      // follows.
      const message =
        err instanceof SpotUploadError ? err.message : err instanceof Error ? err.message : "Couldn't post your Spot — please try again.";
      setError(message);
      setPosting(false);
      setUploadPercent(0);
    }
  };

  const step: "choose" | "preview" = file ? "preview" : "choose";

  return (
    <Modal open={open} onClose={() => { if (!posting) onClose(); }} className="h-[100dvh] w-full max-w-none rounded-none">
      <div className="flex h-full w-full flex-col">
        {step === "choose" ? (
          // Kampos's own compose-sheet surface (bg-brand-tint), same as
          // CreateGistSheet — a plain black wireframe here read as an
          // unbranded camera-app screen, not a Kampos surface. The preview
          // step below stays dark on purpose (it's showing real video, same
          // language as the feed's own player chrome); this step never
          // shows footage, so there's no reason for it to be dark too.
          <div className="flex h-full w-full flex-col bg-brand-tint">
            <div className="relative flex shrink-0 items-center justify-center px-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-3">
              <span className="font-nunito text-base font-bold text-ink">New Spot</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 rounded-full p-1 text-ink hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mx-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-surface-2 px-6 shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Clapperboard className="h-7 w-7" />
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="font-nunito text-sm font-extrabold text-ink">Any shape works</span>
                <span className="font-nunito text-[12px] text-muted">
                  Landscape or square letterboxes to fit — up to {MAX_DURATION_SECONDS / 60} minutes
                </span>
              </div>
              {error && <span className="font-nunito text-[12px] font-semibold text-danger">{error}</span>}
            </div>

            <div className="flex gap-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4">
              <button
                type="button"
                onClick={() => recordInputRef.current?.click()}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-brand py-3.5 text-white shadow-sm shadow-brand/30 active:scale-95"
              >
                <Camera className="h-5 w-5" />
                <span className="font-nunito text-[11.5px] font-extrabold">Record</span>
              </button>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3.5 text-brand shadow-sm active:scale-95"
              >
                <ImageIcon className="h-5 w-5" />
                <span className="font-nunito text-[11.5px] font-extrabold">Upload</span>
              </button>
            </div>

            <input
              ref={recordInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
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
              ref={videoRef}
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
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />

            <div className="absolute inset-x-4 z-10 flex items-center justify-between top-[calc(1rem+env(safe-area-inset-top,0px))]">
              <button
                type="button"
                onClick={reset}
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
