"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AllGistsManager } from "@/app/villagepeople/gists/AllGistsManager";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmReasonModal, ErrorModal } from "@/components/ui/FeedbackModal";
import Link from "next/link";
import { ArrowLeft, DeleteIconFill, EditIconFill, UsersIconFill } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { friendlyDateTime } from "@/lib/format";
import { profileTypeLabel } from "@/lib/profileEditFields";
import { profileDisplayFields } from "@/lib/profileDisplayFields";
import { useReferenceStore } from "@/stores/referenceStore";
import { useProfilesAdminStore } from "@/stores/profilesAdminStore";
import type { AdminGist } from "@/lib/serverGistsAdmin";
import type { ProfileDetailRow } from "@/lib/serverProfilesAdmin";
import type { ProfileType } from "@/types";

function statusColor(status?: string): string {
  if (status === "ACTIVE") return "text-success";
  if (status === "DEACTIVATED" || status === "SUSPENDED") return "text-warning";
  if (status === "DELETED" || status === "BANNED") return "text-danger";
  return "text-muted";
}

/**
 * /villagepeople/profiles/[type]/[avitag] — full read-only profile info
 * (avatar, name, status/verified, every type-specific field via
 * profileDisplayFields — the SAME lookup function/reference lists the
 * account-detail page uses, so campus/major show as "Full Name (TAG)"
 * here too) plus Verify/Unverify/Edit/Delete actions, and below that, this
 * profile's own gists via AllGistsManager's `avitag`-scoped + `embedded`
 * mode (see that component's own doc comment) — reusing the exact same
 * card/comments/reactions/scrollspy machinery the standalone All Gists
 * screen uses, not a second implementation of any of it.
 *
 * Reached from a Profiles-tab row or an Account-detail profile card
 * (both now link here by default instead of straight to editing), so
 * "back" uses `router.back()` — whichever of those brought the admin here
 * is where this correctly returns them. Delete is the one action that
 * makes staying on this page afterward meaningless (there's nothing left
 * to view), so it also falls back to `router.back()` once it succeeds.
 */
export function ProfileViewPage({
  profileType,
  typePath,
  avitag,
  initialProfile,
  initialGists,
}: {
  profileType: ProfileType;
  /** The plural URL segment (students/kreators/kompanies/schools/idiots)
   * this page was already reached under — reused as-is for the Edit link
   * rather than re-deriving it from PROFILE_TYPE_PATH[profileType]. */
  typePath: string;
  avitag: string;
  initialProfile: ProfileDetailRow;
  initialGists: AdminGist[];
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [busyAction, setBusyAction] = useState<"verify" | "ban" | "delete" | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBanConfirm, setShowBanConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const campuses = useReferenceStore((s) => s.campuses);
  const majors = useReferenceStore((s) => s.majors);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchMajors = useReferenceStore((s) => s.fetchMajors);
  const verifyProfile = useProfilesAdminStore((s) => s.verifyProfile);
  const unverifyProfile = useProfilesAdminStore((s) => s.unverifyProfile);
  const banProfile = useProfilesAdminStore((s) => s.banProfile);
  const unbanProfile = useProfilesAdminStore((s) => s.unbanProfile);
  const deleteProfile = useProfilesAdminStore((s) => s.deleteProfile);

  useEffect(() => {
    fetchCampuses().catch(() => {});
    fetchMajors().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  const handleToggleVerify = async () => {
    const nextVerified = !profile.is_verified;
    setBusyAction("verify");
    try {
      if (nextVerified) await verifyProfile(profileType, avitag);
      else await unverifyProfile(profileType, avitag);
      setProfile((prev) => ({ ...prev, is_verified: nextVerified }));
    } catch (err) {
      fail(apiErrorMessage(err, `Failed to ${nextVerified ? "verify" : "unverify"} profile`));
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (reason?: string) => {
    setBusyAction("delete");
    try {
      await deleteProfile(profileType, avitag, reason);
      router.back();
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to delete profile"));
      setBusyAction(null);
    }
  };

  // Unban fires immediately (matching handleToggleVerify's own no-confirm
  // precedent above); ban goes through ConfirmReasonModal first.
  const handleToggleBan = async (reason?: string) => {
    const nextBanned = profile.profile_status !== "BANNED";
    setBusyAction("ban");
    try {
      if (nextBanned) await banProfile(profileType, avitag, reason);
      else await unbanProfile(profileType, avitag);
      setProfile((prev) => ({ ...prev, profile_status: nextBanned ? "BANNED" : "ACTIVE" }));
      setShowBanConfirm(false);
    } catch (err) {
      fail(apiErrorMessage(err, `Failed to ${nextBanned ? "ban" : "unban"} profile`));
    } finally {
      setBusyAction(null);
    }
  };

  const fields = profileDisplayFields(profileType, profile, { campuses, majors });
  const displayName = profile.display_name || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <ConfirmReasonModal
        open={showDeleteConfirm}
        onClose={() => (busyAction === "delete" ? undefined : setShowDeleteConfirm(false))}
        onConfirm={handleDelete}
        loading={busyAction === "delete"}
        title={`Delete this ${profileTypeLabel(profileType).toLowerCase()} profile?`}
        message={`@${avitag} and everything on this profile will be hidden for good. This can't be undone. You can add a reason for the record.`}
        confirmLabel="Delete"
        icon={<DeleteIconFill size={26} weight="fill" />}
      />
      <ConfirmReasonModal
        open={showBanConfirm}
        onClose={() => (busyAction === "ban" ? undefined : setShowBanConfirm(false))}
        onConfirm={handleToggleBan}
        loading={busyAction === "ban"}
        title={`Ban this ${profileTypeLabel(profileType).toLowerCase()} profile?`}
        message={`@${avitag}'s profile will be hidden and unusable until an admin unbans it. You can add a reason for the record; it gets shown back to them.`}
        confirmLabel="Ban"
      />

      {/* Capped/centered part — back button, title, profile info card.
          Deliberately NOT a shared wrapper with the Gists section below: that
          section's own embedded AllGistsManager needs its comment panel to
          reach the TRUE viewport edge (see AllGistsManager's own comment on
          this), which a shared cap on everything would prevent — same split
          ProfileView.tsx's own header-vs-gist-list uses. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pt-10 md:px-10">
        {/* flex-wrap (not a fixed one-line row): on a narrow phone, the
            title + "View account" pill together don't fit one row — this
            used to force the pill's own two-word label to wrap into an
            illegible stack ("View" / "account"). `shrink-0` + `whitespace-
            nowrap` on the pill keep IT intact, and the row itself wraps to
            drop it onto its own line below the title instead. `ml-auto`
            still pushes it to the row's right edge whenever there IS room
            (desktop, or even mobile in landscape). */}
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
              {profileTypeLabel(profileType)} profile
            </h1>
            <p className="mt-1 font-nunito text-sm text-muted">@{avitag}</p>
          </div>
          {/* Account Detail already links out to every one of its profiles
              (see AccountDetailManager.tsx) — this closes the loop the
              other way, since a profile page had no way back to the
              account that owns it. */}
          <Link
            href={`/villagepeople/users/${profile.account_id}`}
            className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line/70 px-3 py-1.5 font-nunito text-xs font-semibold text-muted transition hover:border-brand/40 hover:text-brand"
          >
            <UsersIconFill className="h-3.5 w-3.5" />
            View account
          </Link>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-line/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
                <Avatar src={profile.image_url} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-nunito text-base font-semibold text-ink">
                  {displayName || `@${avitag}`}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-nunito text-xs text-muted">@{avitag}</span>
                  {profile.is_verified && (
                    <span className="font-nunito text-[11px] font-medium text-success">Verified</span>
                  )}
                  {profile.profile_status && profile.profile_status !== "ACTIVE" && (
                    <span className={`font-nunito text-[11px] font-medium ${statusColor(profile.profile_status)}`}>
                      {profile.profile_status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
            <Button
              fullWidth={false}
              className="!px-4 !py-2 text-sm"
              onClick={() => router.push(`/villagepeople/profiles/${typePath}/${avitag}/edit`)}
            >
              <EditIconFill className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant={profile.is_verified ? "secondary" : "primary"}
              fullWidth={false}
              className="!px-4 !py-2 text-sm"
              loading={busyAction === "verify"}
              disabled={busyAction !== null}
              onClick={handleToggleVerify}
            >
              {profile.is_verified ? "Unverify" : "Verify"}
            </Button>
            {profile.profile_status !== "DELETED" && (
              <Button
                variant="secondary"
                fullWidth={false}
                className={
                  profile.profile_status === "BANNED"
                    ? "!px-4 !py-2 text-sm"
                    : "!border-warning !px-4 !py-2 text-sm !text-warning hover:!bg-warning/10"
                }
                loading={busyAction === "ban"}
                disabled={busyAction !== null}
                onClick={() => (profile.profile_status === "BANNED" ? handleToggleBan() : setShowBanConfirm(true))}
              >
                {profile.profile_status === "BANNED" ? "Unban" : "Ban"}
              </Button>
            )}
            <Button
              variant="secondary"
              fullWidth={false}
              className="!border-danger !px-4 !py-2 text-sm !text-danger hover:!bg-danger/5"
              disabled={busyAction !== null}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <DeleteIconFill className="h-3.5 w-3.5" weight="fill" />
              Delete
            </Button>
          </div>

          {profile.profile_status_reason && (
            <p className="break-words rounded-xl bg-warning/10 p-3 font-nunito text-xs text-ink">
              <span className="font-semibold">Reason given: </span>
              {profile.profile_status_reason}
            </p>
          )}

          {(fields.length > 0 || profile.created_at) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
              {fields.map((f) => (
                <div key={f.label} className="min-w-0">
                  <p className="font-nunito text-[11px] text-muted">{f.label}</p>
                  <p className="mt-0.5 break-words font-nunito text-xs font-semibold text-ink">{f.value}</p>
                </div>
              ))}
              {profile.created_at && (
                <div className="min-w-0">
                  <p className="font-nunito text-[11px] text-muted">Joined</p>
                  <p className="mt-0.5 break-words font-nunito text-xs font-semibold text-ink">
                    {friendlyDateTime(profile.created_at)}
                  </p>
                </div>
              )}
              {profile.updated_at && (
                <div className="min-w-0">
                  <p className="font-nunito text-[11px] text-muted">Last updated</p>
                  <p className="mt-0.5 break-words font-nunito text-xs font-semibold text-ink">
                    {friendlyDateTime(profile.updated_at)}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Full-width part — this profile's own gists. A sibling of the capped
          div above, not nested in it, so AllGistsManager's own embedded
          comment panel can reach the true right edge of the viewport. The
          heading here stays visually aligned with the card above via the
          same max-w-3xl/px-6/md:px-10 centering; AllGistsManager applies
          that same centering to its own (embedded) filter bar below, before
          breaking out to full width for the actual gist-list+panel split. */}
      <div className="flex flex-col gap-3 pb-10">
        <h2 className="mx-auto w-full max-w-3xl px-6 font-nunito text-sm font-bold text-ink md:px-10">
          Gists
        </h2>
        <AllGistsManager
          initialGists={initialGists}
          avitag={avitag}
          embedded
          emptyMessage="This profile hasn't posted any gists yet."
        />
      </div>
    </>
  );
}
