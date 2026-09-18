"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountInitialAvatar } from "@/components/villagepeople/AccountInitialAvatar";
import { ProfileCard } from "@/components/villagepeople/ProfileCard";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { SuccessModal, ErrorModal, ConfirmModal, ConfirmReasonModal } from "@/components/ui/FeedbackModal";
import { ArrowLeft, EditIconFill, Lock, DeleteIconFill, Plus, ChevronRight, Send } from "@/components/ui/icons";
import { friendlyDateTime, monthYear } from "@/lib/format";
import { profileTypeLabel, PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import { apiErrorMessage } from "@/lib/api";
import { useReferenceStore } from "@/stores/referenceStore";
import { useUserManagementStore } from "@/stores/userManagementStore";
import type { AccountDetail } from "@/lib/serverUsers";
import type { ProfileType } from "@/types";
import { EditEmailModal } from "./EditEmailModal";

/** Order + one-line description shown in the "which type?" picker — see
 * the section-header "Create profile" button below. */
const CREATABLE_TYPES: { type: ProfileType; blurb: string }[] = [
  { type: "student", blurb: "A student at one of the campuses." },
  { type: "kreator", blurb: "An individual content creator." },
  { type: "kompany", blurb: "A business with a Kampos presence." },
  { type: "school", blurb: "An official school/institution account." },
  { type: "idiot", blurb: "A moderation-facing persona, not the account's admin role." },
];

function statusColor(status?: string): string {
  if (status === "ACTIVE") return "text-success";
  if (status === "DEACTIVATED" || status === "SUSPENDED") return "text-warning";
  if (status === "DELETED") return "text-danger";
  return "text-muted";
}

/**
 * Client half of /villagepeople/users/[accountId] — the account card
 * (email read-only unless `isKing`, role/status/joined/last-login) plus one
 * card per profile under this account, each with its own "Edit" action
 * linking to the full-page profile editor
 * (/villagepeople/profiles/[type]/[avitag] — see that page's own doc
 * comment for why it replaced the old ProfileEditModal popup). That page's
 * own back button uses `router.back()`, which correctly returns here since
 * this is one of its two entry points.
 *
 * `isKing` is computed server-side (this route's own page.tsx, off the same
 * resolveServerAuthState() result the layout's own admin gate used) and
 * passed down rather than re-derived client-side — same reasoning
 * VillagePeopleRail's own `isKing` prop already documents: a client-side
 * hide is a nicety, the real enforcement is the backend 403ing a non-king
 * caller on PATCH /idiot/users/:account_id/email itself.
 */
export function AccountDetailManager({
  initialDetail,
  isKing,
}: {
  initialDetail: AccountDetail;
  isKing: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AccountDetail>(initialDetail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);
  const [showUnsuspendConfirm, setShowUnsuspendConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showCreateTypePicker, setShowCreateTypePicker] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);

  const getAccount = useUserManagementStore((s) => s.getAccount);
  const updateAccountStatus = useUserManagementStore((s) => s.updateAccountStatus);
  const sendEmail = useUserManagementStore((s) => s.sendEmail);
  const campuses = useReferenceStore((s) => s.campuses);
  const majors = useReferenceStore((s) => s.majors);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchMajors = useReferenceStore((s) => s.fetchMajors);

  // For profileDisplayFields' own campus/major full-name lookup below —
  // same reference lists StudentProfilesTab.tsx already fetches for its
  // filter dropdowns, reused here purely for display.
  useEffect(() => {
    fetchCampuses().catch(() => {});
    fetchMajors().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };
  const succeed = (msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
  };

  const refresh = async () => {
    try {
      const fresh = await getAccount(detail.account.account_id);
      if (fresh) setDetail(fresh);
    } catch (err) {
      // Non-fatal — the action itself already succeeded; the page just
      // keeps its locally-patched view instead of the server's own fresh
      // one until a manual reload.
      fail(apiErrorMessage(err, "Refreshed with stale data — the update itself saved fine"));
    }
  };

  const handleEmailSaved = async (newEmail: string) => {
    setEditingEmail(false);
    setDetail((prev) => ({ ...prev, account: { ...prev.account, email: newEmail } }));
    succeed("Email updated.");
    await refresh();
  };

  const handleSuspend = async (reason?: string) => {
    setStatusBusy(true);
    try {
      await updateAccountStatus(detail.account.account_id, "SUSPENDED", reason);
      setShowSuspendConfirm(false);
      succeed("Account suspended — every session they have open is being logged out.");
      await refresh();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to suspend account"));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      await sendEmail(detail.account.account_id, emailSubject.trim(), emailMessage.trim());
      setShowSendEmail(false);
      setEmailSubject("");
      setEmailMessage("");
      succeed("Email sent.");
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to send email"));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleUnsuspend = async () => {
    setStatusBusy(true);
    try {
      await updateAccountStatus(detail.account.account_id, "ACTIVE");
      setShowUnsuspendConfirm(false);
      succeed("Account unsuspended.");
      await refresh();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to unsuspend account"));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleDeleteAccount = async (reason?: string) => {
    setStatusBusy(true);
    try {
      await updateAccountStatus(detail.account.account_id, "DELETED", reason);
      setShowDeleteConfirm(false);
      succeed("Account deleted.");
      await refresh();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to delete account"));
    } finally {
      setStatusBusy(false);
    }
  };

  const { account, profiles } = detail;
  // Backend rejects touching a king's account_status via this route
  // outright (see users.controller.ts's updateStatus) — hidden here too so
  // the buttons aren't just a guaranteed-to-fail dead click.
  const canModerateStatus = account.role !== "king";

  return (
    <>
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      {isKing && (
        <EditEmailModal
          open={editingEmail}
          onClose={() => setEditingEmail(false)}
          accountId={account.account_id}
          currentEmail={account.email}
          onSaved={handleEmailSaved}
        />
      )}
      <ConfirmReasonModal
        open={showSuspendConfirm}
        onClose={() => (statusBusy ? undefined : setShowSuspendConfirm(false))}
        onConfirm={handleSuspend}
        title="Suspend this account?"
        message={`${account.email} won't be able to log in until an admin unsuspends them — every profile they have goes with it. You can add a reason for the record; it gets shown back to them.`}
        confirmLabel="Suspend"
        loading={statusBusy}
      />
      <ConfirmModal
        open={showUnsuspendConfirm}
        onClose={() => (statusBusy ? undefined : setShowUnsuspendConfirm(false))}
        onConfirm={handleUnsuspend}
        title="Unsuspend this account?"
        message={`${account.email} will be able to log in again right away.`}
        confirmLabel="Unsuspend"
        loading={statusBusy}
      />
      <ConfirmReasonModal
        open={showDeleteConfirm}
        onClose={() => (statusBusy ? undefined : setShowDeleteConfirm(false))}
        onConfirm={handleDeleteAccount}
        title="Delete this account?"
        message={`This can't be undone — ${account.email} and every profile they have are gone for good. You can add a reason for the record.`}
        confirmLabel="Delete"
        loading={statusBusy}
        icon={<DeleteIconFill size={26} weight="fill" />}
      />
      <Modal open={showSendEmail} onClose={() => (sendingEmail ? undefined : setShowSendEmail(false))}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-1 font-nunito text-sm font-bold text-ink">Send email</p>
          <p className="mb-4 font-nunito text-xs text-muted">
            A real, one-off email to {account.email} — not a system notification, whatever you write here goes out
            as-is.
          </p>
          <div className="flex flex-col gap-3">
            <TextInput
              value={emailSubject}
              onChange={setEmailSubject}
              placeholder="Subject"
              maxLength={150}
              autoComplete="off"
            />
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Message"
              rows={6}
              maxLength={4000}
              className="w-full resize-none rounded-2xl border border-line bg-surface-2 p-4 font-nunito text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowSendEmail(false)}
              disabled={sendingEmail}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={sendingEmail}
              disabled={!emailSubject.trim() || !emailMessage.trim()}
              onClick={handleSendEmail}
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={showCreateTypePicker} onClose={() => setShowCreateTypePicker(false)}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-1 font-nunito text-sm font-bold text-ink">Create a profile</p>
          <p className="mb-4 font-nunito text-xs text-muted">
            Pick which kind of profile to attach to {account.email}. The next screen asks for that type&apos;s own
            fields.
          </p>
          <ul className="flex flex-col gap-2">
            {CREATABLE_TYPES.map(({ type, blurb }) => (
              <li key={type}>
                <Link
                  href={`/villagepeople/users/${account.account_id}/create-profile/${PROFILE_TYPE_PATH[type]}`}
                  onClick={() => setShowCreateTypePicker(false)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line/70 p-3.5 text-left transition hover:border-brand/40 hover:bg-brand/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-nunito text-sm font-semibold text-ink">{profileTypeLabel(type)}</p>
                    <p className="mt-0.5 truncate font-nunito text-xs text-muted">{blurb}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 md:px-10">
        <div className="flex items-center gap-3">
          <Link
            href="/villagepeople/users"
            aria-label="Back to Accounts"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-nunito text-2xl font-extrabold text-ink">Account</h1>
            <p className="mt-1 font-nunito text-sm text-muted">{account.account_id}</p>
          </div>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-line/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AccountInitialAvatar email={account.email} className="h-12 w-12 shrink-0 text-lg" />
              <div className="min-w-0">
                <p className="mb-1 font-nunito text-xs text-muted">Email</p>
                {isKing ? (
                  <div className="flex items-center gap-2">
                    <p className="break-all font-nunito text-sm font-semibold text-ink">{account.email}</p>
                    <button
                      type="button"
                      onClick={() => setEditingEmail(true)}
                      aria-label="Edit email"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                    >
                      <EditIconFill className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="break-all font-nunito text-sm font-semibold text-ink">{account.email}</p>
                    <Lock className="h-3.5 w-3.5 shrink-0 text-faint" />
                  </div>
                )}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full bg-line/20 px-2.5 py-1 font-nunito text-xs font-semibold ${statusColor(account.account_status)}`}
            >
              {account.account_status ?? "—"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-line/70 pt-4 sm:grid-cols-4">
            <div>
              <p className="font-nunito text-xs text-muted">Role</p>
              <p className="mt-0.5 font-nunito text-sm font-semibold text-ink">{account.role}</p>
            </div>
            <div>
              <p className="font-nunito text-xs text-muted">Joined</p>
              <p className="mt-0.5 font-nunito text-sm font-semibold text-ink">
                {account.created_at ? monthYear(account.created_at) : "—"}
              </p>
            </div>
            <div>
              <p className="font-nunito text-xs text-muted">Last login</p>
              <p className="mt-0.5 font-nunito text-sm font-semibold text-ink">
                {account.last_login ? friendlyDateTime(account.last_login) : "—"}
              </p>
            </div>
            <div>
              <p className="font-nunito text-xs text-muted">OTP verified</p>
              <p className="mt-0.5 font-nunito text-sm font-semibold text-ink">
                {account.is_otp_verified ? "Yes" : "No"}
              </p>
            </div>
          </div>

          {account.account_status_reason && (
            <p className="break-words rounded-xl bg-warning/10 p-3 font-nunito text-xs text-ink">
              <span className="font-semibold">Reason given: </span>
              {account.account_status_reason}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
            <Button
              variant="secondary"
              fullWidth={false}
              className="!px-4 !py-2 text-sm"
              onClick={() => setShowSendEmail(true)}
            >
              <Send className="h-3.5 w-3.5" />
              Send email
            </Button>
          </div>

          {canModerateStatus && account.account_status !== "DELETED" && (
            <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
              {account.account_status === "SUSPENDED" ? (
                <Button
                  variant="secondary"
                  fullWidth={false}
                  className="!px-4 !py-2 text-sm"
                  onClick={() => setShowUnsuspendConfirm(true)}
                >
                  Unsuspend
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth={false}
                  className="!border-warning !px-4 !py-2 text-sm !text-warning hover:!bg-warning/10"
                  onClick={() => setShowSuspendConfirm(true)}
                >
                  Suspend
                </Button>
              )}
              <Button
                variant="secondary"
                fullWidth={false}
                className="!border-danger !px-4 !py-2 text-sm !text-danger hover:!bg-danger/5"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <DeleteIconFill className="h-3.5 w-3.5" weight="fill" />
                Delete account
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-nunito text-sm font-bold text-ink">
              Profiles {profiles.length > 0 && `(${profiles.length})`}
            </h2>
            <Button
              variant="secondary"
              fullWidth={false}
              className="!px-3.5 !py-1.5 text-xs"
              onClick={() => setShowCreateTypePicker(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create profile
            </Button>
          </div>
          {profiles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              This account has no profiles yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.avitag}
                  profile={profile}
                  campuses={campuses}
                  majors={majors}
                  onView={() =>
                    router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH[profile.profile_type]}/${profile.avitag}`)
                  }
                  onEdit={() =>
                    router.push(`/villagepeople/profiles/${PROFILE_TYPE_PATH[profile.profile_type]}/${profile.avitag}/edit`)
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
