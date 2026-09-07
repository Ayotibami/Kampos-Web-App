"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchSelectList } from "@/components/setup/SearchSelectList";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { ArrowLeft, Camera, Plus } from "@/components/ui/icons";
import { api, apiErrorMessage } from "@/lib/api";
import { validateAvitag } from "@/lib/validation";
import { HOBBIES, HOBBY_EMOJI } from "@/lib/hobbies";
import {
  PROFILE_EDIT_FIELDS,
  PROFILE_CREATE_HAS_CAMPUS,
  PROFILE_CREATE_HAS_MAJOR,
  PROFILE_CREATE_HAS_LEVEL,
  PROFILE_TYPE_PATH,
  profileTypeLabel,
} from "@/lib/profileEditFields";
import { useReferenceStore } from "@/stores/referenceStore";
import { useUserManagementStore } from "@/stores/userManagementStore";
import type { ProfileType } from "@/types";

const MAX_HOBBIES = 6;
const LEVELS = ["100", "200", "300", "400", "500", "600"];

function initialValues(list: ReturnType<typeof fields>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of list) {
    next[field.key] = field.kind === "hobbies" ? [] : "";
  }
  return next;
}

const fields = (type: ProfileType) => PROFILE_EDIT_FIELDS[type];

/**
 * An admin attaching a brand new profile to someone's account — the create
 * counterpart to ProfileEditPage.tsx, reusing the same field-kind renderer
 * (avatar/text/textarea/number/hobbies) and the same real Campus/Major/
 * Level pickers (SearchSelectList) off PROFILE_EDIT_FIELDS, just starting
 * blank instead of pre-filled, plus two things editing never needs:
 *
 * - An avitag input (an existing profile's avitag is permanent and shown
 *   read-only elsewhere; a brand new one has to be typed in and picked
 *   right here, same format rules as self-signup's own avitag step —
 *   validateAvitag, lib/validation.ts).
 * - Required-field enforcement (PROFILE_EDIT_FIELDS' own `required` flags,
 *   plus student's campus/major/level — see PROFILE_CREATE_HAS_* below,
 *   which flips those three from editing's "optional" to "required" here:
 *   an admin hand-creating a student profile has no onboarding wizard
 *   behind it to have already collected them).
 */
export function CreateProfilePage({
  profileType,
  accountId,
  accountEmail,
}: {
  profileType: ProfileType;
  accountId: string;
  accountEmail: string;
}) {
  const router = useRouter();
  const list = fields(profileType);

  const hasCampus = PROFILE_CREATE_HAS_CAMPUS[profileType];
  const hasMajor = PROFILE_CREATE_HAS_MAJOR[profileType];
  const hasLevel = PROFILE_CREATE_HAS_LEVEL[profileType];
  const campusKey = profileType === "kreator" ? "campustag" : "campus_tag";
  // Only student requires all three — see this component's own doc comment.
  const campusRequired = profileType === "student";
  const majorRequired = profileType === "student";
  const levelRequired = profileType === "student";

  const [avitag, setAvitag] = useState("");
  const [avitagTouched, setAvitagTouched] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(list));
  const [campus, setCampus] = useState<string | null>(null);
  const [campusSearch, setCampusSearch] = useState("");
  const [campusErrored, setCampusErrored] = useState(false);
  const [major, setMajor] = useState<string | null>(null);
  const [majorSearch, setMajorSearch] = useState("");
  const [majorErrored, setMajorErrored] = useState(false);
  const [level, setLevel] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdAvitag, setCreatedAvitag] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const createProfile = useUserManagementStore((s) => s.createProfile);
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
    // see ProfileEditPage.tsx's identical pattern/comment for why this is
    // suppressed rather than restructured.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasCampus) void loadCampuses();
    if (hasMajor) void loadMajors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avitagError = avitagTouched ? validateAvitag(avitag) : null;

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

  // Uploaded the instant it's picked, same as ProfileEditPage's own avatar
  // field — a real Cloudinary URL is what gets saved, never the picked
  // File itself or a local blob: preview.
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

  // Named, human missing-field list rather than a generic "fill everything
  // in" — an admin filling this out for someone else has no prior context
  // for what's expected, unlike a self-signup wizard that walks one field
  // at a time.
  const missingFieldLabels = (): string[] => {
    const missing: string[] = [];
    if (validateAvitag(avitag)) missing.push("Avitag");
    for (const field of list) {
      if (!field.required) continue;
      const raw = values[field.key];
      if (typeof raw !== "string" || !raw.trim()) missing.push(field.label);
    }
    if (campusRequired && !campus) missing.push("Campus");
    if (majorRequired && !major) missing.push("Major");
    if (levelRequired && !level) missing.push("Level");
    return missing;
  };

  const handleCreate = async () => {
    setAvitagTouched(true);
    const missing = missingFieldLabels();
    if (missing.length > 0) {
      setErrorMessage(`Please fill in: ${missing.join(", ")}.`);
      setShowError(true);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      for (const field of list) {
        const raw = values[field.key];
        if (field.kind === "number") {
          body[field.key] = raw ? Number(raw) : null;
        } else if (field.kind === "hobbies") {
          body[field.key] = raw ?? [];
        } else if (field.kind === "avatar") {
          if (typeof raw === "string" && raw && !raw.startsWith("blob:")) body[field.key] = raw;
        } else {
          body[field.key] = typeof raw === "string" ? raw.trim() || null : raw;
        }
      }
      if (hasCampus) body[campusKey] = campus || null;
      if (hasMajor) body.major_tag = major || null;
      if (hasLevel) body.level = level ? Number(level) : null;

      const created = await createProfile(profileType, accountId, avitag, body);
      setCreatedAvitag((created?.avitag as string) ?? avitag);
      setShowSuccess(true);
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to create profile"));
      setShowError(true);
    } finally {
      setSaving(false);
    }
  };

  const goToNewProfile = () => {
    const target = createdAvitag ?? avitag;
    router.replace(`/villagepeople/profiles/${PROFILE_TYPE_PATH[profileType]}/${target}`);
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <SuccessModal
        open={showSuccess}
        onClose={goToNewProfile}
        onConfirm={goToNewProfile}
        message={`${profileTypeLabel(profileType)} profile created.`}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 pb-28 md:px-10">
        <div className="flex items-center gap-3">
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
              Create {profileTypeLabel(profileType)} profile
            </h1>
            <p className="mt-1 font-nunito text-sm text-muted">for {accountEmail}</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-nunito text-sm font-semibold text-ink">
              Avitag <span className="text-danger">*</span>
            </span>
            <TextInput
              value={avitag}
              onChange={(v) => setAvitag(v.toLowerCase())}
              onBlur={() => setAvitagTouched(true)}
              placeholder="e.g. jane_doe"
              maxLength={15}
              autoComplete="off"
              error={!!avitagError}
            />
            {avitagError ? (
              <span className="font-nunito text-xs text-danger">{avitagError}</span>
            ) : (
              <span className="font-nunito text-xs text-faint">
                This becomes their public handle — kampos.com/{avitag || "…"}. Can&apos;t be changed later.
              </span>
            )}
          </div>

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
                        <Plus className="h-4 w-4 text-white" />
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
                  <span className="font-nunito text-xs text-muted">{field.label} (optional)</span>
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
                  <span className="font-nunito text-sm font-semibold text-ink">
                    {field.label} {field.required && <span className="text-danger">*</span>}
                  </span>
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
              <div key={field.key} className="flex flex-col gap-1.5">
                <span className="font-nunito text-sm font-semibold text-ink">
                  {field.label} {field.required && <span className="text-danger">*</span>}
                </span>
                <TextInput
                  value={(values[field.key] as string) ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  type={field.kind === "number" ? "number" : "text"}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  autoComplete="off"
                />
              </div>
            );
          })}

          {hasCampus && (
            <section className="flex flex-col gap-2">
              <span className="font-nunito text-sm font-semibold text-ink">
                Campus {campusRequired && <span className="text-danger">*</span>}
              </span>
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
              <span className="font-nunito text-sm font-semibold text-ink">
                Major {majorRequired && <span className="text-danger">*</span>}
              </span>
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
              <span className="font-nunito text-sm font-semibold text-ink">
                Level {levelRequired && <span className="text-danger">*</span>}
              </span>
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
          <Button className="flex-1" loading={saving || uploadingAvatar} onClick={handleCreate}>
            Create profile
          </Button>
        </div>
      </div>
    </>
  );
}
