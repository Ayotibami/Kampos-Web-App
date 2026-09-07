import { cookies } from "next/headers";
import { env } from "./env";
import { buildProfileAdminQuery, type ProfileAdminFilters } from "./profilesAdminQuery";

export { buildProfileAdminQuery };
export type { ProfileAdminFilters };

/**
 * Types + server-side list-fetchers for /villagepeople/profiles (the new
 * "browse/search/edit/verify every profile, per TYPE" section) — same split
 * as serverModeration.ts/serverUsers.ts/serverGistsAdmin.ts: GET
 * /idiot/profiles/<type> was still being built in parallel when this was
 * written (no `profiles.routes.ts`/`profiles.controller.ts` exists yet
 * anywhere under KamposBackend/src/modules/idiot/, confirmed by directly
 * searching that directory), so the ENDPOINT PATH and query params below are
 * a best guess from the written task contract, not confirmed against a live
 * response.
 *
 * The per-type ROW FIELDS, however, ARE confirmed against KamposBackend's
 * real migrations/repo.ts files for each type
 * (src/modules/profile/{students,kreators,kompanies,schools,idiots}/repo.ts)
 * — see the two flagged exceptions below (kreator's `campustag`/`joined_at`
 * and kompany's account-email key), which stay genuinely ambiguous because
 * the NEW admin-search controller that would join in extra fields
 * (account_id/email) or rename columns doesn't exist yet to check against.
 * Every existing kreator/kompany route (get/list/update) returns its repo
 * row completely unchanged (`res.json({ data: p })` straight off `SELECT *`
 * — see kreators/controller.ts), so raw passthrough is the best-supported
 * guess, but both key spellings are read defensively wherever these are
 * displayed, in case the new admin controller normalizes them instead.
 */

export type AdminProfileStatus = "ACTIVE" | "DEACTIVATED" | "DELETED" | "BANNED";

/** student_profiles row + account_id/email joined in — confirmed field set
 * against students/repo.ts's StudentProfile interface (avitag, account_id,
 * first_name, last_name, display_name, campus_tag, major_tag, level, bio,
 * hobbies, degree, image_url, is_verified, profile_status, created_at all
 * match that file's real columns 1:1; `email` is the one field NOT on that
 * table itself — assumed joined in from `accounts` the same way
 * AccountProfileRow's own account-centric join already works elsewhere in
 * this section). */
export interface StudentProfileRow {
  avitag: string;
  account_id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  campus_tag: string | null;
  major_tag: string | null;
  level: number | null;
  bio: string | null;
  hobbies: string[] | null;
  degree: string | null;
  image_url: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  created_at: string;
  [key: string]: unknown;
}

/** kreator_profiles row + account_id/email joined in — confirmed against
 * kreators/repo.ts's KreatorProfile interface. Two UNCONFIRMED naming
 * questions (no admin search controller exists yet to check against):
 *  - the real DB/repo column is `campustag` (no underscore) — every existing
 *    kreator route returns it verbatim under that key, so `campustag` is
 *    read here; `campus_tag` is ALSO accepted in case the new admin
 *    endpoint normalizes it to match every other type's naming.
 *  - the real DB/repo column is `joined_at`, not `created_at` — same dual-
 *    key story; `created_at` accepted too since the task's own field list
 *    calls it that.
 */
export interface KreatorProfileRow {
  avitag: string;
  account_id: string;
  email: string;
  display_name: string;
  campustag?: string | null;
  campus_tag?: string | null;
  description: string | null;
  image_url: string | null;
  engagement_score: number | null;
  earnings_balance: string | null;
  monetization_enabled: boolean;
  top_gist_id: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  joined_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** kompany_profiles row + account_id/accountEmail joined in — confirmed
 * against kompanies/repo.ts's KompanyProfile interface (display_name, email,
 * phone_number, image_url, website, social_links, description, is_verified,
 * profile_status, created_at all match real columns 1:1). `email` here is
 * the PROFILE's own separate contact email (the real `kompany_profiles.
 * email` column) — deliberately NOT the login account's email, which is a
 * different field entirely. `accountEmail` (the login email, per the task's
 * own naming) is UNCONFIRMED — no admin search controller exists yet to
 * check whether it actually comes back camelCase like that (every other
 * field in this codebase is snake_case, which makes `accountEmail` the one
 * suspicious spelling here) — `account_email` is also accepted defensively. */
export interface KompanyProfileRow {
  avitag: string;
  account_id: string;
  display_name: string;
  /** The login account's own email (joined in) — NOT this profile's own
   * contact email, see `email` below. */
  accountEmail?: string;
  account_email?: string;
  /** This profile's OWN separate contact email — confirmed DB column
   * `kompany_profiles.email`. Distinct from the account's login email. */
  email: string;
  phone_number: string;
  image_url: string;
  website: string;
  social_links: Record<string, string> | null;
  description: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  created_at: string;
  [key: string]: unknown;
}

/** school_profiles row + account_id/email joined in — confirmed against
 * schools/repo.ts's SchoolProfile interface. */
export interface SchoolProfileRow {
  avitag: string;
  account_id: string;
  email: string;
  display_name: string;
  description: string | null;
  campus_tag: string | null;
  image_url: string | null;
  website: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  created_at: string;
  [key: string]: unknown;
}

/** idiot_profiles row + account_id/email joined in — confirmed against
 * idiots/repo.ts's IdiotProfile interface. Note: "idiot" here is the PROFILE
 * type (a moderation-facing profile), not the account role of the same
 * name — see profileEditFields.ts's own note on this collision. */
export interface IdiotProfileRow {
  avitag: string;
  account_id: string;
  email: string;
  display_name: string;
  description: string | null;
  image_url: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  created_at: string;
  [key: string]: unknown;
}

/**
 * Shared "forward the incoming cookie, hit the backend directly, return []
 * on any failure" fetch — same pattern as serverModeration.ts's
 * fetchModerationList/serverGistsAdmin.ts's listGists. Returning [] rather
 * than throwing means each tab renders an empty state instead of crashing if
 * this route isn't deployed/migrated yet wherever this runs against.
 */
async function fetchProfilesList<T>(typePath: string, filters: ProfileAdminFilters): Promise<T[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const query = buildProfileAdminQuery(filters);
    const res = await fetch(`${env.API_BASE}/idiot/profiles/${typePath}${query ? `?${query}` : ""}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: T[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function listStudentProfiles(filters: ProfileAdminFilters = {}): Promise<StudentProfileRow[]> {
  return fetchProfilesList<StudentProfileRow>("students", filters);
}

export async function listKreatorProfiles(filters: ProfileAdminFilters = {}): Promise<KreatorProfileRow[]> {
  return fetchProfilesList<KreatorProfileRow>("kreators", filters);
}

export async function listKompanyProfiles(filters: ProfileAdminFilters = {}): Promise<KompanyProfileRow[]> {
  return fetchProfilesList<KompanyProfileRow>("kompanies", filters);
}

export async function listSchoolProfiles(filters: ProfileAdminFilters = {}): Promise<SchoolProfileRow[]> {
  return fetchProfilesList<SchoolProfileRow>("schools", filters);
}

export async function listIdiotProfiles(filters: ProfileAdminFilters = {}): Promise<IdiotProfileRow[]> {
  return fetchProfilesList<IdiotProfileRow>("idiots", filters);
}

/**
 * One profile from GET /idiot/profiles/:type/:avitag (isAuth+isIdiot) — a
 * SINGLE profile at ANY status, unlike the public `GET
 * /profiles/<type>/:avitag` which is gated to ACTIVE only. Backs the full-
 * page profile editor (/villagepeople/profiles/[type]/[avitag]).
 *
 * This is the PLAIN repo row for whichever type — e.g. for a student, only
 * students/repo.ts's own StudentProfile columns (avitag, account_id,
 * first_name, last_name, display_name, campus_tag, major_tag, level, bio,
 * hobbies, degree, image_url, is_verified, profile_status, created_at,
 * updated_at). Unlike the per-type list rows above, this response does NOT
 * have a joined `email`/`account_email` — those only exist on the
 * admin-search rows this file's `list*Profiles` functions return. Typed as
 * one loose union of every type's possible fields (same "one interface,
 * mostly-optional fields, read the ones your type actually has" shape as
 * serverUsers.ts's AccountProfileRow) rather than 5 separate interfaces,
 * since the caller already knows its own `profile_type` from the route and
 * just needs the right subset.
 */
export interface ProfileDetailRow {
  avitag: string;
  account_id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  campus_tag?: string | null;
  /** kreator's own real column spelling — no underscore, confirmed in
   * kreators/repo.ts. */
  campustag?: string | null;
  major_tag?: string | null;
  level?: number | null;
  bio?: string | null;
  hobbies?: string[] | null;
  degree?: string | null;
  description?: string | null;
  website?: string | null;
  phone_number?: string | null;
  /** kompany's own separate contact-email column — not the login account's
   * email, which this single-profile response doesn't carry at all. */
  email?: string | null;
  image_url?: string | null;
  is_verified: boolean;
  profile_status: AdminProfileStatus;
  /** Set on admin-triggered ban (not self-deactivate/delete, which don't
   * carry one) — quoted back to the profile's owner. */
  profile_status_reason?: string | null;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Server-side fetch for the profile edit page. Returns null on any failure
 * (404 included) so the route can notFound() instead of crashing — same
 * pattern as serverUsers.ts's getAccountDetail. `typePath` is the plural
 * URL segment (students/kreators/kompanies/schools/idiots), already
 * validated by the caller via profileTypeFromPath before this is called.
 */
export async function getProfile(typePath: string, avitag: string): Promise<ProfileDetailRow | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/profiles/${typePath}/${avitag}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ProfileDetailRow };
    return json.data ?? null;
  } catch {
    return null;
  }
}
