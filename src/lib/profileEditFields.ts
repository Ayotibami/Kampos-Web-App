import type { ProfileType } from "@/types";
import { LIMITS } from "./brand";

/**
 * Data-driven field lists for the admin section's profile edit PAGE
 * (/villagepeople/profiles/[type]/[avitag]/ProfileEditPage.tsx) — one
 * component renders the right fields for whichever `profile_type` it's
 * handed instead of five separate bespoke screens. Editing used to live in
 * a small popup modal (ProfileEditModal.tsx, since deleted); it's now a
 * full page so the Campus/Major/Level pickers below have real room to
 * scroll.
 *
 * `campus_tag`/`major_tag` on students, `campustag` on kreator, and
 * `campus_tag` on school are deliberately NOT listed here even though
 * they're real, admin-editable columns (the consumer app's own
 * self-service editing locks them read-only, but that's a consumer-facing
 * product choice, not a backend rule — `PUT /profiles/<type>/:avitag` has
 * no request-body schema validation at all). The product owner asked for
 * these to render as the exact same searchable-pill-picker UI the
 * onboarding wizard uses (`SearchSelectList`/`Chip`, sourced from
 * `useReferenceStore`'s campus/major lists), not a generic form field, so
 * ProfileEditPage renders them as bespoke sections instead of reading them
 * off this list. There is no more "select" `ProfileFieldKind` for this
 * reason — every remaining kind here is a plain form control.
 *
 * `image_url` on every type is an "avatar" field — a real circular
 * picker + upload (same `POST /profiles/avatar-preupload` endpoint and
 * circular-preview pattern src/app/settings/profile/ProfileSettingsForm.tsx
 * already uses for the consumer app's own avatar), not a raw text box
 * asking an admin to paste a Cloudinary URL by hand.
 *
 * Sourcing per type (see this app's own AGENTS.md-style note in the task:
 * "reuse the shape the consumer app's own self-service editing already
 * calls" — only students actually have that today):
 *
 * - student: lifted from the consumer app's OWN self-service editing —
 *   src/stores/profileStore.ts's `StudentProfileUpdate` +
 *   src/app/settings/profile/ProfileSettingsForm.tsx's actual save payload,
 *   PLUS campus_tag/major_tag (see above — deliberately re-added for the
 *   admin form despite being absent from that consumer payload). Display
 *   name isn't in that shape either (students don't have one distinct from
 *   first/last name in the consumer form), so it's left out here too.
 * - kreator/kompany/school/idiot: NO consumer-app self-service precedent
 *   exists yet (ProfileSettingsForm explicitly shows a "coming soon"
 *   placeholder for every non-student type) — these four field lists are
 *   taken directly from each type's own repo.ts column list in
 *   KamposBackend (src/modules/profile/{kreators,kompanies,schools,idiots}/
 *   repo.ts), minus system/computed columns (avitag, account_id,
 *   is_verified, profile_status, created_at/joined_at, updated_at,
 *   engagement_score, earnings_balance, monetization_enabled,
 *   top_gist_id). `kompany_profiles.social_links` (a loosely-typed JSON
 *   blob) is deliberately left out of the generic form entirely — its real
 *   shape isn't pinned down anywhere in the codebase, so guessing a UI for
 *   it risks writing malformed data.
 */
export type ProfileFieldKind = "text" | "textarea" | "number" | "hobbies" | "avatar";

export interface ProfileFieldDef {
  key: string;
  label: string;
  kind: ProfileFieldKind;
  maxLength?: number;
  placeholder?: string;
  /** Enforced by CreateProfilePage (villagepeople/users/[accountId]/create-
   * profile/[type]) — ignored by ProfileEditPage, which never blocks a save
   * on a field being empty (an existing profile can always be edited down
   * to a blank optional field). Only meaningful for creating a NEW profile,
   * where the backend's own admin*CreateSchema (KamposBackend's
   * schemas/profile.ts) enforces the same requiredness server-side — this
   * flag exists purely so the create form can show it and block submit
   * early, not as its own source of truth. */
  required?: boolean;
}

export const PROFILE_EDIT_FIELDS: Record<ProfileType, ProfileFieldDef[]> = {
  student: [
    { key: "image_url", label: "Photo", kind: "avatar" },
    { key: "first_name", label: "First name", kind: "text", maxLength: 30, required: true },
    { key: "last_name", label: "Last name", kind: "text", maxLength: 30, required: true },
    { key: "bio", label: "Bio", kind: "textarea", maxLength: LIMITS.bio },
    { key: "hobbies", label: "Hobbies", kind: "hobbies" },
  ],
  kreator: [
    { key: "image_url", label: "Photo", kind: "avatar" },
    { key: "display_name", label: "Display name", kind: "text", maxLength: 60, required: true },
    { key: "description", label: "Description", kind: "textarea", maxLength: 500 },
  ],
  kompany: [
    { key: "image_url", label: "Logo", kind: "avatar" },
    { key: "display_name", label: "Display name", kind: "text", maxLength: 60, required: true },
    { key: "email", label: "Contact email", kind: "text", required: true },
    { key: "phone_number", label: "Phone number", kind: "text", required: true },
    { key: "website", label: "Website", kind: "text", required: true },
    { key: "description", label: "Description", kind: "textarea", maxLength: 500 },
  ],
  school: [
    { key: "image_url", label: "Logo", kind: "avatar" },
    { key: "display_name", label: "Display name", kind: "text", maxLength: 60, required: true },
    { key: "description", label: "Description", kind: "textarea", maxLength: 500 },
    { key: "website", label: "Website", kind: "text" },
  ],
  idiot: [
    { key: "image_url", label: "Photo", kind: "avatar" },
    { key: "display_name", label: "Display name", kind: "text", maxLength: 60, required: true },
    { key: "description", label: "Description", kind: "textarea", maxLength: 500 },
  ],
};

/**
 * student/kreator/school get real campus/major/level pickers on the create
 * form, same components (SearchSelectList) CreateProfilePage/ProfileEditPage
 * both reuse from the onboarding wizard — see CreateProfilePage's own doc
 * comment for the one difference from editing: student's three fields are
 * REQUIRED here (an admin hand-creating a student profile has no wizard
 * behind it to have collected them), where editing leaves them optional.
 */
export const PROFILE_CREATE_HAS_CAMPUS: Record<ProfileType, boolean> = {
  student: true,
  kreator: true,
  kompany: false,
  school: true,
  idiot: false,
};
export const PROFILE_CREATE_HAS_MAJOR: Record<ProfileType, boolean> = {
  student: true,
  kreator: false,
  kompany: false,
  school: false,
  idiot: false,
};
export const PROFILE_CREATE_HAS_LEVEL: Record<ProfileType, boolean> = {
  student: true,
  kreator: false,
  kompany: false,
  school: false,
  idiot: false,
};

/**
 * profile_type -> the per-type profile endpoints' own path segment
 * (`/profiles/<segment>/:avitag`) — mirrors KamposBackend's own route
 * mounting (src/modules/profile/index.ts equivalent), NOT just
 * `${type}s`, since "kompany"/"kreator" pluralize irregularly
 * ("kompanies"/"kreators") and "idiot" here means the PROFILE type
 * (idiot_profiles — a moderation-facing profile), not the account role.
 */
export const PROFILE_TYPE_PATH: Record<ProfileType, string> = {
  student: "students",
  kreator: "kreators",
  kompany: "kompanies",
  school: "schools",
  idiot: "idiots",
};

const PATH_TO_PROFILE_TYPE: Record<string, ProfileType> = Object.fromEntries(
  (Object.entries(PROFILE_TYPE_PATH) as [ProfileType, string][]).map(([type, path]) => [path, type]),
) as Record<string, ProfileType>;

/**
 * Inverse of PROFILE_TYPE_PATH — the plural URL segment used by both
 * `/villagepeople/profiles/[type]/...` and the backend's own
 * `/idiot/profiles/:type/...` back to its ProfileType, or null if the
 * segment isn't one of the 5 known types. Used by the profile edit page's
 * route to validate `:type` before fetching/rendering anything.
 */
export function profileTypeFromPath(path: string): ProfileType | null {
  return PATH_TO_PROFILE_TYPE[path] ?? null;
}

/** Title-cases a ProfileType for display, e.g. "kompany" -> "Kompany" —
 * same helper ProfileVerificationsTab.tsx already has locally; duplicated
 * here rather than imported since that one lives in a moderation-specific
 * file this section shouldn't reach into. */
export function profileTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
