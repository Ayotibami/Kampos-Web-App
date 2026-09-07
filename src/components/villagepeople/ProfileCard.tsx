"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EditIconFill } from "@/components/ui/icons";
import { profileTypeLabel } from "@/lib/profileEditFields";
import { profileDisplayFields } from "@/lib/profileDisplayFields";
import type { AccountProfileRow } from "@/lib/serverUsers";
import type { CampusOption, Major } from "@/types";

/**
 * One profile summary card — avatar, name, type/verified/status badges,
 * every field this profile type actually has, and an Edit button. Extracted
 * from AccountDetailManager.tsx (which renders one of these per profile
 * under an account) so villagepeople/me's own page can render the exact
 * same card for the CURRENT admin's own profiles. Switching which profile
 * is active lives entirely in ProfileSwitcherStrip now (a separate control
 * above this list on the Me page) — this card is pure view/edit, same as
 * on every other account's page.
 */
export function ProfileCard({
  profile,
  campuses,
  majors,
  onView,
  onEdit,
}: {
  profile: AccountProfileRow;
  campuses: CampusOption[];
  majors: Major[];
  onView: () => void;
  onEdit: () => void;
}) {
  const fields = profileDisplayFields(profile.profile_type, profile, { campuses, majors });

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line/70 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onView}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition hover:bg-brand/5"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-1 ring-line">
            <Avatar src={profile.image_url} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-nunito text-sm font-semibold text-ink">
              {profile.display_name || `@${profile.avitag}`}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-nunito text-[11px] font-medium text-brand">
                {profileTypeLabel(profile.profile_type)}
              </span>
              <span className="font-nunito text-[11px] text-muted">@{profile.avitag}</span>
              {profile.is_verified && (
                <span className="font-nunito text-[11px] font-medium text-success">Verified</span>
              )}
              {profile.profile_status && profile.profile_status !== "ACTIVE" && (
                <span className="font-nunito text-[11px] font-medium text-warning">{profile.profile_status}</span>
              )}
            </div>
          </div>
        </button>
        <Button variant="secondary" fullWidth={false} className="!px-4 !py-2 text-sm" onClick={onEdit}>
          <EditIconFill className="h-3.5 w-3.5" />
          Edit
        </Button>
      </div>

      {/* Every field this profile type actually has — level/campus/major/
          bio/hobbies for a student, description/website/phone for the
          business-y types, etc. Fields with no value are skipped entirely
          by profileDisplayFields rather than shown blank. */}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-3">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <p className="font-nunito text-[11px] text-muted">{f.label}</p>
              <p className="mt-0.5 break-words font-nunito text-xs font-semibold text-ink">{f.value}</p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
