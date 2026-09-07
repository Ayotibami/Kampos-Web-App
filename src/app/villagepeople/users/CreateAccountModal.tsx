"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { PasswordChecklist, isPasswordValid } from "@/components/ui/PasswordChecklist";
import { SuccessModal, ErrorModal } from "@/components/ui/FeedbackModal";
import { sanitizeInput, validateEmail } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";
import { useUserManagementStore } from "@/stores/userManagementStore";

/**
 * "Create account" entry point on the Users page — POST /idiot/users
 * `{ email, password }`, per the written contract. This only creates the
 * bare account (no profile attached), same as any fresh signup before
 * onboarding — there's no avitag/profile-type picker here, since the
 * backend contract for this route doesn't take one.
 */
export function CreateAccountModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (accountId?: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");

  const createAccount = useUserManagementStore((s) => s.createAccount);

  const reset = () => {
    setEmail("");
    setPassword("");
  };

  const handleClose = () => {
    if (creating) return;
    reset();
    onClose();
  };

  const handleCreate = async () => {
    const cleanEmail = sanitizeInput(email);
    const emailError = validateEmail(cleanEmail);
    if (emailError) {
      setErrorMessage(emailError);
      setShowError(true);
      return;
    }
    if (!isPasswordValid(password)) {
      setErrorMessage("Password doesn't meet every requirement yet.");
      setShowError(true);
      return;
    }

    setCreating(true);
    try {
      const created = await createAccount(cleanEmail, password);
      setCreatedEmail(cleanEmail);
      reset();
      setShowSuccess(true);
      onCreated(created?.account_id);
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to create account"));
      setShowError(true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        message={`Account created for ${createdEmail}.`}
      />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <Modal open={open} onClose={handleClose}>
        <div className="w-[min(92vw,420px)] rounded-3xl bg-surface p-6 shadow-2xl">
          <h2 className="mb-1 font-nunito text-lg font-bold text-ink">Create account</h2>
          <p className="mb-5 font-nunito text-sm text-muted">
            Creates a bare account on someone&apos;s behalf — no profile attached yet.
          </p>

          <div className="flex flex-col gap-4">
            <TextInput
              value={email}
              onChange={setEmail}
              placeholder="Email address"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
            />
            <div>
              <TextInput
                value={password}
                onChange={setPassword}
                placeholder="Password"
                isPassword
                autoComplete="new-password"
              />
              <PasswordChecklist password={password} />
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleClose} disabled={creating}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={creating}
              disabled={!email.trim() || !isPasswordValid(password)}
              onClick={handleCreate}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
