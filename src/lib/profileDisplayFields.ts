import type { CampusOption, Major, ProfileType } from "@/types";

/**
 * What to show, read-only, on the account detail page for one profile —
 * distinct from PROFILE_EDIT_FIELDS (profileEditFields.ts), which is the
 * narrower "what's actually editable" list (e.g. a student's campus/major
 * are locked once set, so they're excluded from the edit form, but an
 * admin still needs to SEE them here). Skips a field entirely when it's
 * null/undefined/empty — a profile with no bio shouldn't show a blank
 * "Bio:" row.
 */
export interface DisplayField {
  label: string;
  value: string;
}

/** Optional reference lists (useReferenceStore's campuses/majors) — when
 * given, Campus/Major render as "Full Name (TAG)" instead of the bare tag
 * the account-detail API returns, same treatment
 * StudentProfilesTab.tsx's own fieldsFor() uses. Optional (not required)
 * so a caller that hasn't loaded these yet still gets the bare tag rather
 * than nothing. */
export interface ProfileDisplayRefs {
  campuses?: CampusOption[];
  majors?: Major[];
}

/** Structural shape covering both AccountProfileRow (serverUsers.ts, the
 * account-detail page) and ProfileDetailRow (serverProfilesAdmin.ts, the
 * profile-view page) — this function only ever reads this same handful of
 * optional fields off either one. `profileType` is a separate explicit
 * argument (rather than reading `profile.profile_type`) because
 * ProfileDetailRow doesn't carry that field at all — the view page's own
 * route param already tells the caller which type it is. */
export interface DisplayableProfile {
  campus_tag?: unknown;
  /** kreator's own real column spelling, no underscore — read defensively
   * alongside campus_tag, same dual-key story as KreatorProfileRow's own
   * fields (see serverProfilesAdmin.ts). */
  campustag?: unknown;
  major_tag?: unknown;
  level?: unknown;
  degree?: unknown;
  bio?: unknown;
  hobbies?: unknown;
  description?: unknown;
  engagement_score?: unknown;
  earnings_balance?: unknown;
  monetization_enabled?: unknown;
  contact_email?: unknown;
  phone_number?: unknown;
  website?: unknown;
  social_links?: unknown;
  [key: string]: unknown;
}

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function profileDisplayFields(
  profileType: ProfileType,
  profile: DisplayableProfile,
  refs: ProfileDisplayRefs = {},
): DisplayField[] {
  const fields: DisplayField[] = [];
  const add = (label: string, value: unknown, format?: (v: unknown) => string) => {
    if (!present(value)) return;
    fields.push({ label, value: format ? format(value) : String(value) });
  };

  // campuses' own `label` already comes pre-formatted as "Full Name (TAG)"
  // (see referenceStore.ts) — majors don't, so that combination is built
  // here, same as StudentProfilesTab.tsx's identical lookup.
  const campusLabel = (tag: unknown) => {
    const match = refs.campuses?.find((c) => c.tag === tag);
    return match?.label ?? String(tag);
  };
  const majorLabel = (tag: unknown) => {
    const match = refs.majors?.find((m) => m.major_tag === tag);
    return match ? `${match.major_name} (${match.major_tag.toUpperCase()})` : String(tag);
  };

  switch (profileType) {
    case "student":
      add("Campus", profile.campus_tag, campusLabel);
      add("Major", profile.major_tag, majorLabel);
      add("Level", profile.level);
      add("Degree", profile.degree);
      add("Bio", profile.bio);
      add("Hobbies", profile.hobbies, (v) => (v as string[]).join(", "));
      break;
    case "kreator":
      add("Campus", profile.campustag ?? profile.campus_tag, campusLabel);
      add("Description", profile.description);
      add("Engagement score", profile.engagement_score);
      add("Earnings balance", profile.earnings_balance, (v) => `₦${v}`);
      add("Monetization", profile.monetization_enabled, (v) => (v ? "Enabled" : "Disabled"));
      break;
    case "kompany":
      // AccountProfileRow's own account-detail join normalizes this to
      // `contact_email`; ProfileDetailRow's raw single-profile fetch
      // doesn't — it's just `email` there (kompany_profiles' own contact
      // email column, confirmed in serverProfilesAdmin.ts). Read both.
      add("Contact email", profile.contact_email ?? profile.email);
      add("Phone", profile.phone_number);
      add("Website", profile.website);
      add("Description", profile.description);
      add("Social links", profile.social_links, (v) => Object.keys(v as object).length
        ? Object.entries(v as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(" · ")
        : "");
      break;
    case "school":
      add("Campus", profile.campus_tag, campusLabel);
      add("Website", profile.website);
      add("Description", profile.description);
      break;
    case "idiot":
      add("Description", profile.description);
      break;
  }

  return fields;
}
