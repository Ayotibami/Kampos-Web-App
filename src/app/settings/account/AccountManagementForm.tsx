"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ErrorModal, SuccessModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { AlertTriangle, DeleteIconFill, VolumeIconFill } from "@/components/ui/icons";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { PasswordChecklist, isPasswordValid } from "@/components/ui/PasswordChecklist";
import { validatePassword, passwordsMatch, sanitizeInput } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";
import { monthYear } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";

export function AccountManagementForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const resolveAuthState = useAuthStore((s) => s.resolveAuthState);
  const changePassword = useAuthStore((s) => s.changePassword);
  const deactivateAccount = useAuthStore((s) => s.deactivateAccount);
  const deleteMyAccount = useAuthStore((s) => s.deleteMyAccount);

  // `user` is populated by HydrateAuth's effect (see layout.tsx), which runs
  // a beat after this component's own first render — normally invisible
  // (nothing else in the app displays user.email/created_at yet), but this
  // page is the first to actually render them, so a fallback fetch here
  // means a slow/missed hydration self-heals instead of showing blank.
  useEffect(() => {
    if (!user) void resolveAuthState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<string>();
  const [pwErrors, setPwErrors] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmMismatch = confirmTouched && confirmPassword.length > 0 && confirmPassword !== newPassword;

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleSave = async () => {
    const cleanOld = sanitizeInput(oldPassword);
    const cleanNew = sanitizeInput(newPassword);

    if (!cleanOld) return fail("Enter your current password first.");
    if (!passwordsMatch(cleanNew, confirmPassword)) {
      setConfirmTouched(true);
      return fail("Almost there — your new passwords need to match.");
    }
    const pwIssues = validatePassword(cleanNew);
    if (pwIssues.length) return fail(undefined, pwIssues);

    setSaving(true);
    try {
      await changePassword({ currentPassword: cleanOld, newPassword: cleanNew });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setConfirmTouched(false);
      setShowSuccess(true);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to change password"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await deactivateAccount();
      router.replace("/login");
    } catch (err) {
      setDeactivating(false);
      setShowDeactivateConfirm(false);
      fail(apiErrorMessage(err, "Failed to deactivate account"));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMyAccount();
      router.replace("/login");
    } catch (err) {
      setDeleting(false);
      setShowDeleteConfirm(false);
      fail(apiErrorMessage(err, "Failed to delete account"));
    }
  };

  return (
    <>
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message="Password don change!" />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} passwordErrors={pwErrors} />
      <ConfirmModal
        open={showDeactivateConfirm}
        onClose={() => (deactivating ? undefined : setShowDeactivateConfirm(false))}
        onConfirm={handleDeactivate}
        title="Deactivate your account?"
        message="This go log you out everywhere and switch your account off — nothing dey deleted. Log back in whenever you're ready and we'll turn it right back on for you."
        confirmLabel="Deactivate"
        icon={<AlertTriangle size={24} strokeWidth={2} />}
        loading={deactivating}
      />
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => (deleting ? undefined : setShowDeleteConfirm(false))}
        onConfirm={handleDelete}
        title="Delete your account?"
        message="This can't be undone — your account and everything on it go be gone for good. If you just want a break, Deactivate above is the reversible option."
        confirmLabel="Delete"
        icon={<DeleteIconFill size={24} weight="fill" />}
        loading={deleting}
      />
      <SettingsPageShell title="Account" backHref="/settings">
        <div className="flex flex-col gap-10">
          <section className="flex flex-col items-center gap-3 border-b border-line/70 pb-8 text-center">
            {user?.email && (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand font-nunito text-2xl font-bold text-white">
                {user.email[0].toUpperCase()}
              </span>
            )}
            <p className="break-all font-nunito text-lg font-bold text-ink">{user?.email}</p>
            {user?.created_at && (
              <span className="font-nunito text-xs text-muted">Joined {monthYear(user.created_at)}</span>
            )}
          </section>

          {/* Desktop-only here — hidden md:flex. Mobile already has this
              exact row on the Settings hub itself (SettingsHub.tsx), one
              tap in; showing it again here too would just be a duplicate.
              Desktop never sees that hub screen at all (SettingsHub
              redirects it straight to /settings/profile), so Account is
              the only place left for it to live there. */}
          <section className="hidden items-center gap-3.5 border-b border-line/70 pb-8 md:flex">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <VolumeIconFill className="h-5 w-5" weight="regular" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-nunito text-sm font-bold text-ink">Sound Effects</span>
              <span className="font-nunito text-sm text-muted">Taps, likes, comments &amp; more</span>
            </span>
            <SoundToggle />
          </section>

          <section className="flex flex-col gap-5">
            <div>
              <h2 className="font-nunito text-sm font-bold text-ink">Change Password</h2>
              <p className="mt-1 font-nunito text-sm text-muted">
                Use a strong password you don&apos;t reuse anywhere else. You&apos;ll need your current
                password to confirm the change.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">Old password</span>
              <TextInput
                value={oldPassword}
                onChange={setOldPassword}
                placeholder="Old password"
                isPassword
                autoComplete="current-password"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">New Password</span>
              <TextInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder="New Password"
                isPassword
                autoComplete="new-password"
              />
              <PasswordChecklist password={newPassword} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-nunito text-sm text-muted">Confirm password</span>
              <TextInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={() => setConfirmTouched(true)}
                placeholder="New Password"
                isPassword
                autoComplete="new-password"
                error={confirmMismatch}
              />
              {confirmMismatch && (
                <p className="pl-1 font-nunito text-xs text-danger">Passwords don&apos;t match.</p>
              )}
            </div>

            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!oldPassword || !isPasswordValid(newPassword) || !confirmPassword}
            >
              Save
            </Button>
          </section>

          <section className="flex flex-col gap-4 border-t border-line/70 pt-8">
            <div>
              <h2 className="font-nunito text-sm font-bold text-danger">Danger zone</h2>
              <p className="mt-1 font-nunito text-sm text-muted">
                Deactivating logs you out everywhere and switches your account off temporarily — nothing is
                deleted, and logging back in turns it right back on. Deleting is permanent.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                fullWidth={false}
                className="!border-warning !text-warning hover:!bg-warning/10"
                onClick={() => setShowDeactivateConfirm(true)}
              >
                Deactivate Account
              </Button>
              <Button
                variant="secondary"
                fullWidth={false}
                className="!border-danger !text-danger hover:!bg-danger/5"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <DeleteIconFill className="h-3.5 w-3.5" weight="fill" />
                Delete Account
              </Button>
            </div>
          </section>
        </div>
      </SettingsPageShell>
    </>
  );
}
