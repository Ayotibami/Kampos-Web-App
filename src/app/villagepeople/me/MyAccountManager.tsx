"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountInitialAvatar } from "@/components/villagepeople/AccountInitialAvatar";
import { ProfileCard } from "@/components/villagepeople/ProfileCard";
import { ProfileSwitcherStrip } from "@/components/villagepeople/ProfileSwitcherStrip";
import { PushNotificationToggle } from "@/components/villagepeople/PushNotificationToggle";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { ExternalLinkIconFill, Plus, ChevronRight } from "@/components/ui/icons";
import { friendlyDateTime, monthYear } from "@/lib/format";
import { profileTypeLabel, PROFILE_TYPE_PATH } from "@/lib/profileEditFields";
import { useReferenceStore } from "@/stores/referenceStore";
import type { AccountDetail } from "@/lib/serverUsers";
import type { ProfileType } from "@/types";

function statusColor(status?: string): string {
  if (status === "ACTIVE") return "text-success";
  if (status === "DEACTIVATED" || status === "SUSPENDED") return "text-warning";
  if (status === "DELETED") return "text-danger";
  return "text-muted";
}

/** Same picker copy AccountDetailManager's own "Create profile" uses —
 * kept as its own copy rather than a shared export since it's four short
 * lines and the two pages would otherwise need to import from each other. */
const CREATABLE_TYPES: { type: ProfileType; blurb: string }[] = [
  { type: "student", blurb: "A student at one of the campuses." },
  { type: "kreator", blurb: "An individual content creator." },
  { type: "kompany", blurb: "A business with a Kampos presence." },
  { type: "school", blurb: "An official school/institution account." },
  { type: "idiot", blurb: "A moderation-facing persona, not the account's admin role." },
];

/**
 * /villagepeople/me's client half — deliberately NOT AccountDetailManager
 * reused with an "isSelf" flag: that page's Suspend/Delete-account/Send-
 * email buttons all act ON SOMEONE ELSE, and none of them make sense
 * pointed at yourself (self-suspending or emailing yourself through the
 * admin danger-button path, rather than Settings' own correct self-service
 * flow, isn't a feature — it's a footgun). This page shows the same
 * account/profile READ data via the same ProfileCard component, adds a
 * "Manage in Settings" link for the things Settings already does correctly
 * (email, password, deactivate, delete), and adds the one thing that's
 * genuinely new: switching which of your own profiles is active.
 *
 * `switchProfile` (profileStore.ts) already existed and already works —
 * POST /auth/switch-profile rotates the session's access/refresh tokens
 * with the new profile's claims — it just never had a UI anywhere in the
 * app to trigger it from. `role` (what makes an admin an admin) lives on
 * the ACCOUNT, not the active profile, so switching here never affects
 * admin-panel access either way — confirmed against auth.service.ts's own
 * issueTokenForProfile, which re-derives role fresh rather than trusting
 * whatever was baked into the previous token.
 */
export function MyAccountManager({ initialDetail }: { initialDetail: AccountDetail }) {
  const router = useRouter();
  // Read-only for this page's own lifetime — nothing here mutates the
  // account/profile rows themselves (switching a profile only changes
  // which one is ACTIVE, tracked client-side by authStore, not this data;
  // creating a new profile navigates away entirely), so a plain destructure
  // is enough — no local state/refetch machinery needed.
  const { account, profiles } = initialDetail;
  const [showCreateTypePicker, setShowCreateTypePicker] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const campuses = useReferenceStore((s) => s.campuses);
  const majors = useReferenceStore((s) => s.majors);
  const fetchCampuses = useReferenceStore((s) => s.fetchCampuses);
  const fetchMajors = useReferenceStore((s) => s.fetchMajors);

  useEffect(() => {
    fetchCampuses().catch(() => {});
    fetchMajors().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };

  return (
    <>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />

      <Modal open={showCreateTypePicker} onClose={() => setShowCreateTypePicker(false)}>
        <div className="rounded-3xl bg-surface p-5 shadow-2xl">
          <p className="mb-1 font-nunito text-sm font-bold text-ink">Create a profile</p>
          <p className="mb-4 font-nunito text-xs text-muted">
            Pick which kind of profile to add to your own account. The next screen asks for that type&apos;s own
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
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">My Account</h1>
          <p className="mt-1 font-nunito text-sm text-muted">Your own account and profiles on Kampos.</p>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-line/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AccountInitialAvatar email={account.email} className="h-12 w-12 shrink-0 text-lg" />
              <div className="min-w-0">
                <p className="mb-1 font-nunito text-xs text-muted">Email</p>
                <p className="break-all font-nunito text-sm font-semibold text-ink">{account.email}</p>
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

          {/* Email/password/deactivate/delete all already work correctly
              for a self-service caller via Settings — this page doesn't
              duplicate that flow, just points at it. */}
          <div className="border-t border-line/70 pt-4">
            <Link
              href="/settings/account"
              className="flex items-center gap-1.5 font-nunito text-sm font-semibold text-brand hover:underline"
            >
              Manage email, password, or account status in Settings
              <ExternalLinkIconFill className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        <PushNotificationToggle onError={fail} />

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-nunito text-sm font-bold text-ink">
              My profiles {profiles.length > 0 && `(${profiles.length})`}
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
              You don&apos;t have any profiles yet.
            </p>
          ) : (
            <>
              <ProfileSwitcherStrip profiles={profiles} onError={fail} />
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
                      router.push(
                        `/villagepeople/profiles/${PROFILE_TYPE_PATH[profile.profile_type]}/${profile.avitag}/edit`,
                      )
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
