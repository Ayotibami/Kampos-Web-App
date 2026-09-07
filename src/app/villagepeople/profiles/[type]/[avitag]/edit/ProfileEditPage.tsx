"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchSelectList } from "@/components/setup/SearchSelectList";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import Link from "next/link";
import { ArrowLeft, Camera, EditIconFill, Plus, UsersIconFill } from "@/components/ui/icons";
import { api, apiErrorMessage } from "@/lib/api";
import { HOBBIES, HOBBY_EMOJI } from "@/lib/hobbies";
import { PROFILE_EDIT_FIELDS, profileTypeLabel } from "@/lib/profileEditFields";
import { useReferenceStore } from "@/stores/referenceStore";
import { useUserManagementStore } from "@/stores/userManagementStore";
import type { ProfileDetailRow } from "@/lib/serverProfilesAdmin";
import type { ProfileType } from "@/types";

const MAX_HOBBIES = 6;
const LEVELS = ["100", "200", "300", "400", "500", "600"];

const fields = (type: ProfileType) => PROFILE_EDIT_FIELDS[type];

function initialValues(profile: ProfileDetailRow, list: ReturnType<typeof fields>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of list) {
    if (field.kind === "hobbies") {
      next[field.key] = Array.isArray(profile[field.key]) ? profile[field.key] : [];
    } else {
      next[field.key] = profile[field.key] != null ? String(profile[field.key]) : "";
    }
  }
  return next;
}

/**
 * Full-page profile editor — replaced ProfileEditModal.tsx (a popup) so the
 * Campus/Major/Level pickers below have real vertical room instead of
 * fighting a modal's `max-h-85vh` for space. Everything BESIDES
 * campus/major/level (avatar, text/textarea/number/hobbies fields) is
 * data-driven off PROFILE_EDIT_FIELDS, same as the old modal.
 *
 * Campus/Major/Level are bespoke sections reusing the EXACT components the
 * consumer app's own onboarding wizard uses for the same three fields
 * (SearchSelectList — see SchoolStep.tsx/AcademicsStep.tsx) rather than a
 * generic form control, per the product owner's explicit ask. Unlike
 * AcademicsStep, Level is always visible here with no reveal-after-Major
 * animation — this is editing an existing profile, not a first-time
 * funnel, so there's no reason to hide it.
 *
 * Which of the three a given `profileType` gets:
 *  - student: campus_tag + major_tag + level (all three)
 *  - kreator: campus only, real column `campustag` (no underscore)
 *  - school: campus only, real column `campus_tag`
 *  - kompany/idiot: neither
 *
 * Reached from the profile-view page's own Edit button (../page.tsx) or a
 * Profiles-tab row's pencil icon, so "back" uses `router.back()` rather
 * than a fixed href — whichever of those brought the admin here is where
 * this correctly returns them.
 */
export function ProfileEditPage({
  profileType,
  avitag,
  initialProfile,
}: {
  profileType: ProfileType;
  avitag: string;
  initialProfile: ProfileDetailRow;
}) {
  const router = useRouter();
  const list = fields(profileType);

  const hasCampus = profileType === "student" || profileType === "kreator" || profileType === "school";
  const hasMajor = profileType === "student";
  const hasLevel = profileType === "student";
  const campusKey = profileType === "kreator" ? "campustag" : "campus_tag";
  const initialCampus = (initialProfile.campustag ?? initialProfile.campus_tag) as string | null | undefined;

  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(initialProfile, list));
  const [campus, setCampus] = useState<string | null>(initialCampus || null);
  const [campusSearch, setCampusSearch] = useState("");
  const [campusErrored, setCampusErrored] = useState(false);
  const [major, setMajor] = useState<string | null>((initialProfile.major_tag as string | null) || null);
  const [majorSearch, setMajorSearch] = useState("");
  const [majorErrored, setMajorErrored] = useState(false);
  const [level, setLevel] = useState<string | null>(
    initialProfile.level != null ? String(initialProfile.level) : null,
  );

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateProfile = useUserManagementStore((s) => s.updateProfile);
  const campuses = useReferenceStore((s) => s.campuses);
  const majors = useReferenceStore((s) => s.majors);
  const loadingCampuses = useReferenceStore((s) => s.loadingCampuses);
  const loadingMajors = useReferenceStore((s) => s.loadingMajors);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchMajors = useReferenceStore((s) => s.fetchMajors);

  const loadCampuses = async () => {
    try {
      await fetchCampuses();
      setCampusErrored(false);
    } catch {
      setCampusErrored(true);
    }
  };
  const loadMajors = async () => {
    try {
      await fetchMajors();
      setMajorErrored(false);
    } catch {
      setMajorErrored(true);
    }
  };

  useEffect(() => {
    // Both setState calls happen inside loadCampuses/loadMajors' own
    // post-`await` continuation, not synchronously in this effect body —
    // the linter can't see through the function call to confirm that, so
    // it's suppressed rather than restructured (this is the standard
    // "fetch reference data on mount" shape, not the synchronous-setState
    // footgun the rule exists to catch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasCampus) void loadCampuses();
    if (hasMajor) void loadMajors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHobby = (h: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev.hobbies) ? (prev.hobbies as string[]) : [];
      const next = current.includes(h)
        ? current.filter((x) => x !== h)
        : current.length >= MAX_HOBBIES
          ? current
          : [...current, h];
      return { ...prev, hobbies: next };
    });
  };

  // Uploaded the instant it's picked, same as the consumer app's own avatar
  // step (ProfileSettingsForm.tsx) — a real Cloudinary URL is what gets
  // saved, never the picked File itself or a local blob: preview.
  const onPickAvatar = async (field: string, file: File | undefined) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setValues((prev) => ({ ...prev, [field]: previewUrl }));
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("image", file, file.name);
      const res = await api.post<{ success: boolean; url?: string }>("/profiles/avatar-preupload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!res.data?.url) throw new Error("Upload failed");
      setValues((prev) => ({ ...prev, [field]: res.data!.url }));
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to upload photo"));
      setShowError(true);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const field of list) {
        const raw = values[field.key];
        if (field.kind === "number") {
          patch[field.key] = raw ? Number(raw) : null;
        } else if (field.kind === "hobbies") {
          patch[field.key] = raw ?? [];
        } else if (field.kind === "avatar") {
          // A still-uploading/blob preview never gets sent — only a real,
          // already-uploaded Cloudinary URL is a valid image_url. Omitting
          // it entirely (rather than sending "") leaves the existing photo
          // untouched if nothing new was picked.
          if (typeof raw === "string" && raw && !raw.startsWith("blob:")) {
            patch[field.key] = raw;
          }
        } else {
          patch[field.key] = typeof raw === "string" ? raw.trim() || null : raw;
        }
      }
      if (hasCampus) patch[campusKey] = campus || null;
      if (hasMajor) patch.major_tag = major || null;
      if (hasLevel) patch.level = level ? Number(level) : null;

      await updateProfile(profileType, avitag, patch);
      setShowSuccess(true);
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to update profile"));
      setShowError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <SuccessModal
        open={showSuccess}
        onClose={() => router.back()}
        onConfirm={() => router.back()}
        message="Profile updated."
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 pb-28 md:px-10">
        {/* flex-wrap — see ProfileViewPage.tsx's identical header for why:
            title + "View account" pill don't both fit one row on a narrow
            phone, so the pill (kept intact via shrink-0/whitespace-nowrap)
            drops to its own line instead of having its own label wrap. */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-nunito text-2xl font-extrabold text-ink">
              Edit {profileTypeLabel(profileType)} profile
            </h1>
            <p className="mt-1 font-nunito text-sm text-muted">@{avitag}</p>
          </div>
          {/* This page can be reached directly from a Profiles-tab row's
              pencil icon (skipping the view page entirely — see this file's
              own doc comment), so it needs its own way back to the owning
              account too, not just the view page. */}
          <Link
            href={`/villagepeople/users/${initialProfile.account_id}`}
            className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line/70 px-3 py-1.5 font-nunito text-xs font-semibold text-muted transition hover:border-brand/40 hover:text-brand"
          >
            <UsersIconFill className="h-3.5 w-3.5" />
            View account
          </Link>
        </div>

        <div className="flex flex-col gap-6">
          {list.map((field) => {
            if (field.kind === "avatar") {
              const imageUrl = (values[field.key] as string) || "";
              return (
                <div key={field.key} className="flex flex-col items-center gap-2">
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
                            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Camera className="h-8 w-8 text-brand" />
                          )}
                          {uploadingAvatar && (
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
                      onChange={(e) => void onPickAvatar(field.key, e.target.files?.[0])}
                    />
                  </div>
                  <span className="font-nunito text-xs text-muted">{field.label}</span>
                </div>
              );
            }

            if (field.kind === "hobbies") {
              const selected = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  <span className="font-nunito text-sm font-semibold text-ink">
                    {field.label} (up to {MAX_HOBBIES})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {HOBBIES.map((h) => (
                      <Chip key={h} selected={selected.includes(h)} onClick={() => toggleHobby(h)}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] leading-none">
                            {HOBBY_EMOJI[h]}
                          </span>
                          {h}
                        </span>
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            }

            if (field.kind === "textarea") {
              return (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <span className="font-nunito text-sm font-semibold text-ink">{field.label}</span>
                  <textarea
                    value={(values[field.key] as string) ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    maxLength={field.maxLength}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-line bg-surface-2 p-4 font-nunito text-sm text-ink outline-none focus:border-brand"
                  />
                </div>
              );
            }

            return (
              <TextInput
                key={field.key}
                label={field.label}
                value={(values[field.key] as string) ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                type={field.kind === "number" ? "number" : "text"}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                autoComplete="off"
              />
            );
          })}

          {hasCampus && (
            <section className="flex flex-col gap-2">
              <span className="font-nunito text-sm font-semibold text-ink">Campus</span>
              <div className="flex h-[420px] flex-col rounded-2xl border border-line/70 p-3">
                <SearchSelectList
                  layout="list"
                  options={campuses.map((c) => ({ id: c.tag, label: c.label }))}
                  selectedId={campus}
                  onSelect={setCampus}
                  search={campusSearch}
                  onSearch={setCampusSearch}
                  placeholder="Search campuses"
                  loading={loadingCampuses}
                  errored={campusErrored}
                  onRetry={loadCampuses}
                  retryLabel="Fetch Campuses"
                />
              </div>
            </section>
          )}

          {hasMajor && (
            <section className="flex flex-col gap-2">
              <span className="font-nunito text-sm font-semibold text-ink">Major</span>
              <div className="flex h-[420px] flex-col rounded-2xl border border-line/70 p-3">
                <SearchSelectList
                  layout="chips"
                  options={majors.map((m) => ({ id: m.major_tag, label: m.major_name }))}
                  selectedId={major}
                  onSelect={setMajor}
                  search={majorSearch}
                  onSearch={setMajorSearch}
                  placeholder="Search majors"
                  loading={loadingMajors}
                  errored={majorErrored}
                  onRetry={loadMajors}
                  retryLabel="Fetch Majors"
                />
              </div>
            </section>
          )}

          {hasLevel && (
            <section className="flex flex-col gap-2">
              <span className="font-nunito text-sm font-semibold text-ink">Level</span>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((lvl) => (
                  <Chip key={lvl} selected={level === lvl} onClick={() => setLevel(lvl)}>
                    {lvl}
                  </Chip>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line/70 bg-surface p-4">
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving || uploadingAvatar} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}
