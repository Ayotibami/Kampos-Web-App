"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { ProfileSettingsSkeleton } from "./ProfileSettingsSkeleton";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { Camera, Plus, Lock, EditIconFill } from "@/components/ui/icons";
import { api, apiErrorMessage } from "@/lib/api";
import { validateName } from "@/lib/validation";
import { LIMITS } from "@/lib/brand";
import { monthYear } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import { useProfileStore } from "@/stores/profileStore";

const LEVELS = ["100", "200", "300", "400", "500", "600"];

function bioCountColor(len: number): string {
  if (len === 0) return "var(--color-muted)";
  if (len < 125) return "var(--color-success)";
  if (len < 220) return "var(--color-warning)";
  return "var(--color-danger)";
}

/** "University of Lagos (UNILAG)" — falls back to the bare tag if the
 * profile fetch's joined name is missing for some reason. */
function tagLabel(name: string | null | undefined, tag: string | null | undefined): string {
  if (name && tag) return `${name} (${tag.toUpperCase()})`;
  return tag ?? "—";
}

/**
 * Profile Settings — first/last name, level, bio, avatar for the signed-in
 * user's own student profile. Only students can create profiles today (the
 * setup wizard only builds a StudentProfilePayload), so kreator/kompany/
 * school profile types get a "not yet" placeholder rather than a form for
 * fields that don't exist on their profile shape.
 */
export function ProfileSettingsForm() {
  const router = useRouter();
  const avitag = useAuthStore((s) => s.avitag);
  const profileType = useAuthStore((s) => s.profileType);
  const getStudentProfile = useProfileStore((s) => s.getStudentProfile);
  const updateStudentProfile = useProfileStore((s) => s.updateStudentProfile);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  // Full display labels ("University of Lagos (UNILAG)"), not raw tags —
  // the profile fetch's GET /profiles/students/:avitag now joins campus/major
  // by tag server-side (repo.ts findByAvitag) and returns campus_name/
  // major_name alongside the tags, so no separate reference-list fetch or
  // client-side matching is needed here. Not directly editable here — see
  // SchoolStep/AcademicsStep in the setup wizard for the picker to reuse
  // once school/major changes get their own deliberate flow.
  const [schoolLabel, setSchoolLabel] = useState("—");
  const [majorLabel, setMajorLabel] = useState("—");

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Non-student profile types render their own "not available yet" branch
    // below (checked ahead of the loading spinner) without ever needing
    // loadingProfile flipped — nothing to fetch for them here.
    if (!avitag || profileType !== "student") return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getStudentProfile(avitag);
        if (cancelled || !profile) return;
        setFirstName(String(profile.first_name ?? ""));
        setLastName(String(profile.last_name ?? ""));
        setLevel(profile.level != null ? String(profile.level) : null);
        setBio(String(profile.bio ?? ""));
        setImageUrl((profile.image_url as string | null | undefined) ?? null);
        setCreatedAt((profile.created_at as string | undefined) ?? null);
        setSchoolLabel(
          tagLabel(profile.campus_name as string | null, profile.campus_tag as string | null),
        );
        setMajorLabel(tagLabel(profile.major_name as string | null, profile.major_tag as string | null));
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Failed to load your profile"));
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avitag, profileType]);

  // Uploaded the instant it's picked, same as the setup wizard's avatar step
  // — a real Cloudinary URL is what gets saved, not the picked File itself.
  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file, file.name);
      const res = await api.post<{ success: boolean; url?: string }>("/profiles/avatar-preupload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!res.data?.url) throw new Error("Upload failed");
      setImageUrl(res.data.url);
    } catch (err) {
      setMessage(apiErrorMessage(err, "Failed to upload photo"));
      setShowError(true);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!avitag) return;
    const nameError = validateName(firstName, lastName);
    if (nameError) {
      setMessage(nameError);
      setShowError(true);
      return;
    }
    setSaving(true);
    try {
      await updateStudentProfile(avitag, {
        first_name: firstName.trim().replace(/\s+/g, " "),
        last_name: lastName.trim().replace(/\s+/g, " "),
        ...(level ? { level: Number(level) } : {}),
        bio: bio.trim(),
        // A still-uploading/blob preview never gets sent — only a real,
        // already-uploaded Cloudinary URL is a valid image_url.
        ...(imageUrl && !imageUrl.startsWith("blob:") ? { image_url: imageUrl } : {}),
      });
      setShowSuccess(true);
    } catch (err) {
      setMessage(apiErrorMessage(err, "Failed to save changes"));
      setShowError(true);
    } finally {
      setSaving(false);
    }
  };

  if (avitag && profileType && profileType !== "student") {
    return (
      <SettingsPageShell title="Profile Settings" backHref="/settings">
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="font-nunito text-sm text-muted">Editing dey come soon for this profile type.</p>
        </div>
      </SettingsPageShell>
    );
  }

  if (loadingProfile) {
    return (
      <SettingsPageShell title="Profile Settings" backHref="/settings">
        <ProfileSettingsSkeleton />
      </SettingsPageShell>
    );
  }

  if (loadError) {
    return (
      <SettingsPageShell title="Profile Settings" backHref="/settings">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="font-nunito text-sm text-muted">{loadError}</p>
        </div>
      </SettingsPageShell>
    );
  }

  return (
    <>
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        message="Your profile don update!"
        onConfirm={() => {
          setShowSuccess(false);
          router.push("/settings");
        }}
      />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <SettingsPageShell title="Profile Settings" backHref="/settings">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col items-center gap-3 border-b border-line/70 pb-8 text-center">
            <p className="font-nunito text-xs text-muted">Tap to change your profile image</p>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={imageUrl ? "Change photo" : "Choose photo"}
                className="relative rounded-full transition-transform active:scale-95"
              >
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand p-0.5">
                  <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand/10">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="Your avatar" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-8 w-8 text-brand" />
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
                  className="absolute -bottom-1 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand ring-4 ring-surface"
                >
                  {imageUrl ? (
                    <EditIconFill className="h-4 w-4 text-white" weight="fill" />
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
                onChange={(e) => void onPickAvatar(e.target.files?.[0])}
              />
            </div>
            {avitag && <p className="font-nunito text-sm font-semibold text-brand">{avitag}</p>}
            {createdAt && <p className="font-nunito text-xs text-muted">Joined since {monthYear(createdAt)}</p>}
          </section>

          <section className="flex flex-col gap-5">
            <div>
              <h2 className="font-nunito text-sm font-bold text-ink">Basic Info</h2>
              <p className="mt-1 font-nunito text-sm text-muted">This is how other students recognize you.</p>
            </div>
            <TextInput value={firstName} onChange={setFirstName} placeholder="First Name" maxLength={30} />
            <TextInput value={lastName} onChange={setLastName} placeholder="Last Name" maxLength={30} />
          </section>

          <section className="flex flex-col gap-5">
            <div>
              <h2 className="font-nunito text-sm font-bold text-ink">Academic Info</h2>
              {/* helper text pending */}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">School</span>
              <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-line/10 px-4 py-3.5 opacity-70">
                <span className="flex-1 truncate font-nunito text-sm text-ink">{schoolLabel}</span>
                <Lock className="h-4 w-4 shrink-0 text-faint" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">Major</span>
              <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-line/10 px-4 py-3.5 opacity-70">
                <span className="flex-1 truncate font-nunito text-sm text-ink">{majorLabel}</span>
                <Lock className="h-4 w-4 shrink-0 text-faint" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-nunito text-sm text-muted">Level</span>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((lvl) => (
                  <Chip key={lvl} selected={level === lvl} onClick={() => setLevel(lvl)}>
                    {lvl} lvl
                  </Chip>
                ))}
              </div>
            </div>
          </section>

        <div className="flex flex-col gap-1">
          <span className="mb-1 font-nunito text-sm text-muted">Bio</span>
          <div className="rounded-3xl border border-line p-4">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={LIMITS.bio}
              rows={4}
              placeholder="Oya, yarn small about yourself na 😌"
              className="w-full resize-none bg-transparent font-nunito text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>
          <p className="mt-1 text-right font-nunito text-sm font-bold" style={{ color: bioCountColor(bio.length) }}>
            {bio.length}/{LIMITS.bio}
          </p>
        </div>

        <Button onClick={handleSave} loading={saving} disabled={uploadingImage}>
          Save details
        </Button>
        </div>
      </SettingsPageShell>
    </>
  );
}
