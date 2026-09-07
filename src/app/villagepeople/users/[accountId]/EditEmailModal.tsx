"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { sanitizeInput, validateEmail } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";
import { useUserManagementStore } from "@/stores/userManagementStore";

/**
 * King-only email edit — PATCH /idiot/users/:account_id/email. The caller
 * (AccountDetailManager) only ever mounts/opens this behind its own
 * `isKing` check, same "hide it AND the backend still enforces it" pattern
 * as /villagepeople/admins: a plain 'idiot' admin never sees the control
 * that opens this, and even if they somehow triggered it, the backend
 * itself 403s a non-king caller on this exact route per the written
 * contract.
 */
export function EditEmailModal({
  open,
  onClose,
  accountId,
  currentEmail,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
  currentEmail: string;
  onSaved: (newEmail: string) => void;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const updateEmail = useUserManagementStore((s) => s.updateEmail);

  const handleClose = () => {
    if (saving) return;
    setEmail(currentEmail);
    onClose();
  };

  const handleSave = async () => {
    const cleanEmail = sanitizeInput(email);
    const emailError = validateEmail(cleanEmail);
    if (emailError) {
      setErrorMessage(emailError);
      setShowError(true);
      return;
    }
    setSaving(true);
    try {
      await updateEmail(accountId, cleanEmail);
      onSaved(cleanEmail);
    } catch (err) {
      setErrorMessage(apiErrorMessage(err, "Failed to update email"));
      setShowError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <Modal open={open} onClose={handleClose}>
        <div className="w-[min(92vw,420px)] rounded-3xl bg-surface p-6 shadow-2xl">
          <h2 className="mb-1 font-nunito text-lg font-bold text-ink">Change account email</h2>
          <p className="mb-5 font-nunito text-sm text-muted">
            King-only. This changes the account&apos;s login email directly.
          </p>

          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="Email address"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
          />

          <div className="mt-6 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1" loading={saving} disabled={!email.trim()} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
