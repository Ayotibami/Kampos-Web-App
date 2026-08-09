"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/TextInput";
import { Avatar } from "@/components/ui/Avatar";
import { Check, X } from "@/components/ui/icons";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import { useProfileStore } from "@/stores/profileStore";
import { validateAvitag, normalizeAvitag } from "@/lib/validation";
import { api, apiErrorMessage } from "@/lib/api";
import { LIMITS } from "@/lib/brand";
import type { StepController } from "../types";

type Availability = "idle" | "checking" | "available" | "taken";

// Wait for a pause in typing before hitting the backend — checking on every
// keystroke would spam the DB for something that's mid-edit anyway.
const CHECK_DEBOUNCE_MS = 450;

/** Last step — no `onNext`, since there's nothing after it. On success this
 * leaves the wizard entirely (a real route change to /feed), unlike every
 * other step which just advances the local step index. */
export function AvitagStep({
  setController,
}: {
  setController: (c: StepController) => void;
}) {
  const router = useRouter();
  const { data, imageUrl, update, reset } = useSetupProfileStore();
  const { createStudentProfile, loading } = useProfileStore();

  // Seeded from the store — e.g. if createStudentProfile fails and someone
  // navigates away and back, they don't have to retype it.
  const [avitag, setAvitag] = useState(data.avitag);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [availability, setAvailability] = useState<Availability>("idle");

  // Instant, local — no reason to wait on the network for format problems
  // (length/charset/etc) the client can already tell are wrong.
  const formatError = avitag ? validateAvitag(avitag) : null;

  // Debounced live availability check against the backend — only runs once
  // the format is already valid. `checkId` guards against a slower earlier
  // request resolving after a faster later one and clobbering its result: a
  // fast typist can easily fire several checks before the first responds.
  // Set once creation actually succeeds — the unmount cleanup below only
  // clears the persisted wizard data if this is true, so navigating away
  // mid-setup (never finished) still leaves everything intact to resume
  // later, same as always.
  const completedRef = useRef(false);

  // Clears the wizard's localStorage data (name/campus/bio/avitag/picture)
  // once this step is actually torn down — not the moment creation
  // succeeds. Doing it eagerly used to flip currentStep back to 0 while
  // the success modal was still up, which re-rendered step 1 behind it for
  // a visible instant before /feed's navigation could swap the page out.
  // Unmount only happens once that navigation genuinely takes over, so
  // there's nothing left on screen for the reset to flash.
  useEffect(() => {
    return () => {
      if (completedRef.current) reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkId = useRef(0);
  useEffect(() => {
    if (formatError || !avitag) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAvailability("idle");
      return;
    }
    const normalized = normalizeAvitag(avitag);
    const id = ++checkId.current;
    setAvailability("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ success: boolean; available: boolean }>(
          `/profiles/avitag-available/${encodeURIComponent(normalized)}`,
        );
        if (checkId.current !== id) return; // superseded by a newer check
        setAvailability(res.data?.available ? "available" : "taken");
      } catch {
        if (checkId.current !== id) return;
        // Network hiccup — don't falsely claim it's taken; Continue just
        // stays disabled until a check actually succeeds.
        setAvailability("idle");
      }
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avitag]);

  const fail = (msg?: string) => {
    setMessage(msg);
    setShowError(true);
  };

  const onAvitagChange = (value: string) => {
    setAvitag(value);
    update({ avitag: value });
  };

  const handleContinue = async () => {
    const error = validateAvitag(avitag);
    if (error) return fail(error);
    if (availability !== "available") {
      return fail("Pesin don use this Avitag, Try another one.");
    }

    const normalized = normalizeAvitag(avitag);
    update({ avitag: normalized });

    try {
      await createStudentProfile({ ...data, avitag: normalized }, imageUrl);
      // Flags the unmount cleanup above to actually clear the persisted
      // wizard data — deliberately not calling reset() directly here, see
      // that effect's comment for why.
      completedRef.current = true;
      setShowSuccess(true);
    } catch (err) {
      let msg = apiErrorMessage(err, "Create student profile failed");
      if (
        msg.includes("student_profiles_pkey") ||
        msg.toLowerCase().includes("duplicate")
      ) {
        msg = "No vex, dem don carry this tag. Create another one.";
        // The live check said "available" a moment ago, but someone else
        // grabbed it in the meantime (a real race — the check is advisory,
        // the DB's primary key is what actually decides). Without this the
        // inline text below the input would keep showing green/"good to
        // go" even while this modal says otherwise.
        setAvailability("taken");
      }
      fail(msg);
    }
  };

  useEffect(() => {
    // Continue doubles as "we've already confirmed this tag is free" — so
    // it's only ever enabled once the backend check has actually resolved
    // "available", not just once the format looks right.
    setController({
      continueDisabled: availability !== "available",
      onContinue: handleContinue,
      loading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avitag, availability, loading]);

  const statusText = formatError
    ? formatError
    : availability === "checking"
      ? "Checking..."
      : availability === "available"
        ? "Oya you can use this Avitag"
        : availability === "taken"
          ? "Pesin don use this Avitag, Try another one"
          : null;
  const statusColor =
    formatError || availability === "taken"
      ? "text-danger"
      : availability === "available"
        ? "text-success"
        : "text-muted";

  // Inline status right in the field — spinner while checking, X once
  // confirmed taken, green check once confirmed free — the same glance-
  // able pattern most sites use for a live username check, instead of
  // only ever finding out from the text underneath.
  const trailingIcon =
    availability === "checking" ? (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
    ) : availability === "taken" ? (
      <X className="h-4 w-4 text-danger" />
    ) : availability === "available" ? (
      <Check className="h-4 w-4 text-success" />
    ) : undefined;

  const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ");
  const previewTags = [data.campus_tag, data.major_tag, data.level ? `${data.level}L` : null].filter(Boolean);

  return (
    <>
      <ErrorModal
        open={showError}
        onClose={() => setShowError(false)}
        message={message}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => router.replace("/feed")}
        onConfirm={() => router.replace("/feed")}
        confirmLabel="Let's Gist"
        message="Your profile don ready! Welcome to Kampos."
      />
      <div className="flex flex-col gap-4">
        <TextInput
          value={avitag}
          onChange={onAvitagChange}
          placeholder="Create your Unique Avitag"
          maxLength={LIMITS.avitagMax}
          autoCapitalize="none"
          trailingIcon={trailingIcon}
        />
        {statusText && (
          <p className={`font-poppins text-sm font-medium ${statusColor}`}>{statusText}</p>
        )}

        {/* Only once it's actually confirmed free — not while still
            checking, not on a taken tag — so this reads as "here's you,
            for real" rather than a preview of a name someone else already
            has. Real avatar/name/tags, the same header treatment a real
            gist card uses, so picking an avitag feels like seeing your
            actual profile rather than filling out one more form field. */}
        {availability === "available" && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-white p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-line/60 ring-1 ring-line">
              <Avatar src={imageUrl} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                {displayName && (
                  <span className="min-w-0 truncate font-poppins text-sm font-bold text-ink">{displayName}</span>
                )}
                <span className="min-w-0 truncate font-poppins text-xs text-faint">
                  @{normalizeAvitag(avitag)}
                </span>
              </div>
              {previewTags.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {previewTags.map((t) => (
                    <span
                      key={t}
                      className="inline-block rounded-full bg-brand/10 px-2 py-0.5 font-poppins text-[10px] font-semibold uppercase tracking-wide text-brand"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <p className="font-poppins text-sm leading-relaxed text-muted">
          Just keep it respectful, or your account may be suspended.
        </p>
      </div>
    </>
  );
}
