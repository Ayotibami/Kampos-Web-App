"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { useSetupProfileStore } from "@/stores/setupProfileStore";
import { validateName, validateNamePart } from "@/lib/validation";
import type { StepProps } from "../types";

export function NameStep({ onNext, setController }: StepProps) {
  const { data, update } = useSetupProfileStore();
  // Seeded from the store (not blank) so navigating back here from a later
  // step — school, academics, etc. — shows what was already typed instead
  // of an empty form.
  const [firstName, setFirstName] = useState(data.first_name);
  const [lastName, setLastName] = useState(data.last_name);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  // Instant, local — no reason to wait for Continue to tell someone their
  // name has a digit in it. Only shown once a field's non-empty, so an
  // untouched field doesn't read as "wrong" before they've typed anything.
  const firstNameError = validateNamePart(firstName, "First name");
  const lastNameError = validateNamePart(lastName, "Last name");

  // Written to the shared store the instant it changes, not just on
  // Continue — the store is just an in-memory draft, so there's no reason a
  // pick only "counts" once you've clicked through.
  const onFirstNameChange = (value: string) => {
    setFirstName(value);
    update({ first_name: value });
  };
  const onLastNameChange = (value: string) => {
    setLastName(value);
    update({ last_name: value });
  };

  const handleContinue = () => {
    const error = validateName(firstName, lastName);
    if (error) {
      setMessage(error);
      setShowError(true);
      return;
    }
    update({
      first_name: firstName.trim().replace(/\s+/g, " "),
      last_name: lastName.trim().replace(/\s+/g, " "),
    });
    onNext();
  };

  useEffect(() => {
    setController({
      continueDisabled: !firstName || !lastName || !!firstNameError || !!lastNameError,
      onContinue: handleContinue,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, firstNameError, lastNameError]);

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <TextInput
            value={firstName}
            onChange={onFirstNameChange}
            placeholder="First Name"
            maxLength={30}
            autoComplete="given-name"
            error={!!firstNameError}
          />
          {firstNameError && (
            <p className="font-poppins text-sm font-medium text-danger">{firstNameError}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <TextInput
            value={lastName}
            onChange={onLastNameChange}
            placeholder="Last Name"
            maxLength={30}
            autoComplete="family-name"
            error={!!lastNameError}
          />
          {lastNameError && (
            <p className="font-poppins text-sm font-medium text-danger">{lastNameError}</p>
          )}
        </div>
        {/* Same reasoning other apps surface here — people are more careful
            (and trust the platform more) once they know *why* a real name
            is being asked for, not just told to provide one. */}
        <p className="font-poppins text-xs leading-relaxed text-faint">
          We use your name so other students on Kampos can tell it&apos;s
          really you — it also helps if you ever need to verify your account.
          Your info stays safe with us, always.
        </p>
      </div>
    </>
  );
}
