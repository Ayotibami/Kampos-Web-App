"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { ProfileSettingsSkeleton } from "./ProfileSettingsSkeleton";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { Camera, Plus, Lock, EditIconFill } from "@/components/ui/icons";
import { api, apiErrorMessage } from "@/lib/api";
import { validateName } from "@/lib/validation";
import { LIMITS } from "@/lib/brand";
import { monthYear } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import { useProfileStore } from "@/stores/profileStore";
import { useUnsavedChangesStore } from "@/stores/unsavedChangesStore";
import { markProfileUpdated } from "@/lib/profileFreshness";
import { env } from "@/lib/env";

const LEVELS = ["100", "200", "300", "400", "500", "600"];

// Freeform on the backend (plain string[], no fixed vocabulary enforced —
// see student.controller.ts) — this fixed list is a frontend-only choice,
// picked for actually being things Nigerian campus life revolves around
// rather than a generic "hobbies" list off the shelf.
const HOBBIES = [
  "Football", "Basketball", "Gaming", "Reading", "Writing", "Photography",
  "Fashion", "Dancing", "Singing", "Cooking", "Baking", "Gym & Fitness",
  "Traveling", "Movies & TV", "Music Production", "DJing", "Painting & Art",
  "Fashion Design", "Hair & Makeup", "Coding", "Entrepreneurship", "Debate",
  "Public Speaking", "Content Creation", "Volunteering", "Chess",
  "Table Tennis", "Swimming", "Spoken Word", "Comedy & Skits",
  "Whot & Ludo", "Crypto & Trading", "Graphic Design", "Video Editing",
  "Podcasting", "Vlogging", "Thrifting", "Anime & K-drama", "Journaling",
  "Cycling", "Hiking", "Skating", "Volleyball", "Track & Field",
  "MCing & Hosting", "Fellowship & Ministry", "Board Games", "Karaoke",
  "Modeling", "Language Learning",
];
const MAX_HOBBIES = 6;

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
  const [hobbies, setHobbies] = useState<string[]>([]);
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
  // The as-loaded/as-saved values — compared against the live fields below
  // to compute isDirty, which drives the unsaved-changes guard. Updated
  // after every successful load and every successful save.
  const [baseline, setBaseline] = useState<{
    firstName: string;
    lastName: string;
    level: string | null;
    bio: string;
    hobbies: string[];
    imageUrl: string | null;
  } | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [savingFromModal, setSavingFromModal] = useState(false);
  const pendingProceedRef = useRef<(() => void) | null>(null);
  const setGuard = useUnsavedChangesStore((s) => s.setGuard);

  const loadProfile = useCallback(async () => {
    // Non-student profile types render their own "not available yet" branch
    // below (checked ahead of the loading spinner) without ever needing
    // loadingProfile flipped — nothing to fetch for them here.
    if (!avitag || profileType !== "student") return;
    try {
      const profile = await getStudentProfile(avitag);
      if (!profile) return;
      const next = {
        firstName: String(profile.first_name ?? ""),
        lastName: String(profile.last_name ?? ""),
        level: profile.level != null ? String(profile.level) : null,
        bio: String(profile.bio ?? ""),
        hobbies: Array.isArray(profile.hobbies) ? (profile.hobbies as string[]) : [],
        imageUrl: (profile.image_url as string | null | undefined) ?? null,
      };
      setFirstName(next.firstName);
      setLastName(next.lastName);
      setLevel(next.level);
      setBio(next.bio);
      setHobbies(next.hobbies);
      setImageUrl(next.imageUrl);
      setBaseline(next);
      setCreatedAt((profile.created_at as string | undefined) ?? null);
      setSchoolLabel(tagLabel(profile.campus_name as string | null, profile.campus_tag as string | null));
      setMajorLabel(tagLabel(profile.major_name as string | null, profile.major_tag as string | null));
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Failed to load your profile"));
    } finally {
      setLoadingProfile(false);
    }
  }, [avitag, profileType, getStudentProfile]);

  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avitag, profileType]);

  // Arrays are never reference-equal even with identical contents, and
  // selection order doesn't mean anything here — sorted-and-stringified is
  // the simplest correct comparison at this list's size (max MAX_HOBBIES).
  const hobbiesChanged =
    !!baseline &&
    JSON.stringify([...hobbies].sort()) !== JSON.stringify([...baseline.hobbies].sort());

  const isDirty =
    !!baseline &&
    (firstName !== baseline.firstName ||
      lastName !== baseline.lastName ||
      level !== baseline.level ||
      bio !== baseline.bio ||
      hobbiesChanged ||
      imageUrl !== baseline.imageUrl);

  const toggleHobby = (h: string) => {
    setHobbies((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : prev.length >= MAX_HOBBIES ? prev : [...prev, h],
    );
  };

  // Registers/clears the guard SettingsHeader's back arrow and SettingsRail's
  // links call before navigating away from this page — see
  // stores/unsavedChangesStore.ts. Only active while there's actually
  // something unsaved; cleared on unmount either way.
  useEffect(() => {
    if (!isDirty) {
      setGuard(null);
      return;
    }
    setGuard((proceed) => {
      pendingProceedRef.current = proceed;
      setShowUnsavedModal(true);
    });
    return () => setGuard(null);
  }, [isDirty, setGuard]);

  // Covers hard navigation the guard above can't (closing the tab,
  // refreshing, typing a new URL) — browser-controlled generic text, no
  // custom UI possible here by design (a security restriction, not a
  // choice this app can override).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

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

  // Shared by the main "Save details" button and the unsaved-changes
  // modal's "Save" option. Returns whether it actually succeeded, so each
  // caller can decide what happens next (show the success modal vs. resume
  // the navigation that was waiting on this).
  const performSave = async (): Promise<boolean> => {
    if (!avitag) return false;
    const nameError = validateName(firstName, lastName);
    if (nameError) {
      setMessage(nameError);
      setShowError(true);
      return false;
    }
    try {
      await updateStudentProfile(avitag, {
        first_name: firstName.trim().replace(/\s+/g, " "),
        last_name: lastName.trim().replace(/\s+/g, " "),
        ...(level ? { level: Number(level) } : {}),
        bio: bio.trim(),
        hobbies,
        // A still-uploading/blob preview never gets sent — only a real,
        // already-uploaded Cloudinary URL is a valid image_url.
        ...(imageUrl && !imageUrl.startsWith("blob:") ? { image_url: imageUrl } : {}),
      });
      setBaseline({ firstName, lastName, level, bio, hobbies, imageUrl });
      // Other pages showing this same profile (own profile page, feed) can
      // be sitting on a client-cached pre-edit snapshot for up to 5 minutes
      // (see profileFreshness.ts) — flag that a real edit just happened so
      // whichever one gets visited next knows to self-refresh once.
      markProfileUpdated();
      return true;
    } catch (err) {
      setMessage(apiErrorMessage(err, "Failed to save changes"));
      setShowError(true);
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await performSave();
    setSaving(false);
    if (ok) setShowSuccess(true);
  };

  // Resumes whatever navigation was waiting (SettingsHeader's back arrow /
  // SettingsRail's links) once the choice is made — discard just proceeds,
  // save only proceeds if it actually succeeded (a failed save leaves the
  // modal closed and ErrorModal visible instead, same as the main button).
  const resumePendingNavigation = () => {
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setGuard(null);
    proceed?.();
  };

  const handleDiscardUnsaved = () => {
    setShowUnsavedModal(false);
    resumePendingNavigation();
  };

  const handleSaveFromUnsavedModal = async () => {
    setSavingFromModal(true);
    const ok = await performSave();
    setSavingFromModal(false);
    setShowUnsavedModal(false);
    if (ok) resumePendingNavigation();
  };

  if (avitag && profileType && profileType !== "student") {
    return (
      <SettingsPageShell title="Profile" backHref="/settings">
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="font-nunito text-sm text-muted">Editing dey come soon for this profile type.</p>
        </div>
      </SettingsPageShell>
    );
  }

  if (loadingProfile) {
    return (
      <SettingsPageShell title="Profile" backHref="/settings">
        <ProfileSettingsSkeleton />
      </SettingsPageShell>
    );
  }

  if (loadError) {
    return (
      <SettingsPageShell title="Profile" backHref="/settings">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="font-nunito text-sm text-muted">
            We encountered an issue fetching your profile. Relax, it&apos;s our fault.
          </p>
          <Button fullWidth={false} onClick={() => void loadProfile()}>
            Try again
          </Button>
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
      <Modal open={showUnsavedModal} onClose={() => setShowUnsavedModal(false)}>
        <div className="rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-2xl">
            ✍️
          </div>
          <p className="mb-1.5 font-nunito text-sm font-semibold text-ink">Save before you go?</p>
          <p className="mb-5 font-nunito text-sm text-muted">
            You&apos;ve made changes on this page that haven&apos;t been saved yet.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleDiscardUnsaved} disabled={savingFromModal}>
              Discard
            </Button>
            <Button className="flex-1" loading={savingFromModal} onClick={() => void handleSaveFromUnsavedModal()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <SettingsPageShell title="Profile" backHref="/settings">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col items-center gap-3 border-b border-line/70 pb-8 text-center">
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
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">School</span>
              <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-line/10 px-4 py-3.5 opacity-70">
                <span className="min-w-0 flex-1 truncate font-nunito text-sm text-ink">{schoolLabel}</span>
                <Lock className="h-4 w-4 shrink-0 text-faint" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">Major</span>
              <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-line/10 px-4 py-3.5 opacity-70">
                <span className="min-w-0 flex-1 truncate font-nunito text-sm text-ink">{majorLabel}</span>
                <Lock className="h-4 w-4 shrink-0 text-faint" />
              </div>
            </div>

            <p className="-mt-2 font-nunito text-xs text-muted">
              Your school and major are one-time — they shape your feed and how other students find and
              recognize you, so they&apos;re not meant to change anyhow, same as real life. Got a genuine
              reason to update yours?{" "}
              <a
                href={env.CONTACT_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                Reach out to us
              </a>
              .
            </p>

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

        <section className="flex flex-col gap-2">
          <div>
            <h2 className="font-nunito text-sm font-bold text-ink">Hobbies</h2>
            <p className="mt-1 font-nunito text-sm text-muted">
              Pick up to {MAX_HOBBIES} — shows other students what you&apos;re actually about.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {HOBBIES.map((h) => (
              <Chip key={h} selected={hobbies.includes(h)} onClick={() => toggleHobby(h)}>
                {h}
              </Chip>
            ))}
          </div>
        </section>

        <Button onClick={handleSave} loading={saving} disabled={uploadingImage}>
          Save details
        </Button>
        </div>
      </SettingsPageShell>
    </>
  );
}
