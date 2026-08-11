"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X, SwitchCamera } from "@/components/ui/icons";

/**
 * Live webcam photo capture via getUserMedia. Streams the camera into a <video>,
 * snapshots a frame to a canvas, and returns a JPEG blob. Cleans up the stream
 * on close/unmount so the camera light turns off.
 */
export function WebcamCapture({
  onCapture,
  onClose,
}: {
  onCapture: (blob: Blob, url: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError("No vex — I no fit reach your camera. Check say you allow permission.");
      }
    }
    function stop() {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing]);

  const snap = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror front-camera shots so the snapshot matches the preview.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob, URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.9,
    );
  };

  // Portalled to document.body — this can be opened from a compose modal
  // triggered deep inside a Framer Motion-animated gist card (GistStack),
  // and a `transform` on any ancestor becomes the containing block for
  // `position: fixed` descendants. Without the portal it renders trapped
  // inside that card's own box instead of actually covering the viewport
  // (same fix as Modal/GistMediaOverlay).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex flex-col bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close camera"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/20 p-2 text-white"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-8 text-center font-nunito text-sm text-white/80">{error}</p>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
          />
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-center gap-10 pb-10 pt-4">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label="Switch camera"
            className="rounded-full bg-white/15 p-3 text-white"
          >
            <SwitchCamera className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={snap}
            aria-label="Take photo"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-white/40"
          >
            <Camera className="h-7 w-7 text-brand" />
          </button>
          <div className="w-12" />
        </div>
      )}
    </div>,
    document.body,
  );
}
