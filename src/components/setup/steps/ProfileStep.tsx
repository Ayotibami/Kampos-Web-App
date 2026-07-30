"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Camera, Plus } from "@/components/ui/icons";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import { LIMITS } from "@/lib/brand";
import type { StepProps } from "../types";

function bioCountColor(len: number): string {
  if (len === 0) return "var(--color-muted)";
  if (len < 125) return "var(--color-success)";
  if (len < 220) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function ProfileStep({ onNext, setController }: StepProps) {
  const { data, image, imageUrl, uploadingImage, imageUploadError, update, setImage, uploadAvatar } =
    useSetupProfileStore();
  const [bio, setBio] = useState(data.bio);
  const [showUploadError, setShowUploadError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Uploaded to Cloudinary the instant it's picked, not held as a raw file
  // until final submit — that's what lets the photo actually survive a
  // reload (see setupProfileStore: an object URL/File can't be persisted,
  // but the URL this returns can).
  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (image?.uri) URL.revokeObjectURL(image.uri);
    setImage({ uri: URL.createObjectURL(file), type: file.type, name: file.name });
    const url = await uploadAvatar(file, file.name);
    if (!url) setShowUploadError(true);
  };

  // Resuming a session: the object-URL preview doesn't survive a reload,
  // but the real uploaded URL does — fall back to that so the avatar still
  // shows without needing to re-pick a photo.
  const avatarSrc = image?.uri || imageUrl;

  const onBioChange = (value: string) => {
    setBio(value);
    update({ bio: value });
  };

  const handleContinue = () => {
    onNext();
  };

  useEffect(() => {
    // Both photo and bio are optional — never block Continue on them, to
    // avoid drop-off. Only wait out an upload actually in flight.
    setController({ continueDisabled: uploadingImage, onContinue: handleContinue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadingImage]);

  return (
    <>
      <ErrorModal
        open={showUploadError}
        onClose={() => setShowUploadError(false)}
        message={imageUploadError ?? undefined}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4">
        {/* Avatar — one real <button> covering the circle AND the badge (the
            badge pokes slightly outside the circle's own box via -bottom-1,
            so as a separate sibling element that sliver wasn't actually
            clickable even though it looked like part of the same shape).
            Stays a plain plus at rest, then switches to a camera icon once a
            photo's set (now reads as "change photo" instead of "add photo"). */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={avatarSrc ? "Change photo" : "Choose photo"}
            className="relative rounded-full transition-transform active:scale-95"
          >
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand p-1.5">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#1877F2]/15">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="Your avatar" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-8 w-8 text-[#1877F2]" />
                )}
                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  </div>
                )}
              </div>
            </div>
            <div
              aria-hidden
              className="absolute -bottom-1 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#1877F2] ring-4 ring-surface"
            >
              {avatarSrc ? (
                <Camera className="h-4 w-4 text-white" />
              ) : (
                <Plus className="h-4 w-4 text-white" />
              )}
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
        </div>

        {/* Bio */}
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div className="flex min-h-0 flex-1 rounded-3xl border border-[#5F6368]/40 p-4">
            <textarea
              value={bio}
              onChange={(e) => onBioChange(e.target.value)}
              maxLength={LIMITS.bio}
              placeholder="Oya, yarn small about yourself na 😌"
              className="w-full flex-1 resize-none bg-transparent font-poppins text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>
          <p
            className="mt-1 shrink-0 text-right font-poppins text-sm font-bold"
            style={{ color: bioCountColor(bio.length) }}
          >
            {bio.length}/{LIMITS.bio}
          </p>
        </div>
      </div>
    </>
  );
}
